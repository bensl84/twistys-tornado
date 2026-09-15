#!/usr/bin/env ruby

# Copied from Ben's truth-audit skill, version 2.0.0.

require "pathname"
require "open3"
require "yaml"

module TruthAudit
  VERSION = "2.0.0"

  class Repository
    DOCUMENT_EXTENSIONS = %w[.md .markdown .mdx .rst .adoc].freeze
    DEFAULT_EXCLUDED_ROOTS = %w[
      .git .github .serena DerivedData build vendor node_modules Packages SourcePackages
    ].freeze

    attr_reader :root

    def initialize(root = Dir.pwd)
      @root = File.expand_path(root)
    end

    def check
      errors = []
      config = load_config(errors)
      return errors unless config

      max = Integer(config.fetch("max_documents", 10)) rescue nil
      errors << "max_documents must be a positive integer" unless max && max.positive?
      maintained = string_list(config, "maintained_documents", errors)
      evidence_roots = string_list(config, "evidence_roots", errors, required: false)
      excluded_roots = DEFAULT_EXCLUDED_ROOTS + string_list(config, "excluded_roots", errors, required: false)

      errors << "maintained_documents exceeds the configured limit of #{max}" if max && maintained.length > max
      errors << "maintained_documents contains duplicates" if maintained.uniq.length != maintained.length
      maintained.each { |path| errors << "Maintained document is missing: #{path}" unless File.file?(absolute(path)) }

      documents.each do |path|
        next if excluded?(path, excluded_roots)
        next if maintained.include?(path)
        next if dated_evidence?(path, evidence_roots)
        errors << "Unclassified documentation: #{path}. Consolidate, delete, or register it without exceeding #{max || 10}."
      end

      maintained.each { |path| errors.concat(link_errors(path)) if File.file?(absolute(path)) }
      errors
    end

    private

    def load_config(errors)
      path = absolute(".truth-audit.yml")
      unless File.file?(path)
        errors << "Missing .truth-audit.yml"
        return nil
      end
      value = YAML.safe_load(File.read(path), aliases: false)
      unless value.is_a?(Hash)
        errors << ".truth-audit.yml must contain a mapping"
        return nil
      end
      value
    rescue Psych::Exception => error
      errors << ".truth-audit.yml is invalid YAML: #{error.message}"
      nil
    end

    def string_list(config, key, errors, required: true)
      value = config[key]
      return [] if value.nil? && !required
      unless value.is_a?(Array) && value.all? { |item| item.is_a?(String) && !item.empty? }
        errors << "#{key} must be a list of repository paths"
        return []
      end
      value
    end

    def documents
      stdout, _stderr, status = Open3.capture3(
        "git", "-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"
      )
      if status.success?
        return stdout.split("\0").select do |path|
          !path.empty? && File.file?(absolute(path)) && human_document?(absolute(path))
        end.sort
      end

      Dir.glob(File.join(root, "**", "*"), File::FNM_DOTMATCH).each_with_object([]) do |path, found|
        next unless File.file?(path) && human_document?(path)
        found << Pathname.new(path).relative_path_from(Pathname.new(root)).to_s
      end.sort
    end

    def human_document?(path)
      DOCUMENT_EXTENSIONS.include?(File.extname(path).downcase) ||
        %w[status.yml status.yaml release-state.yml release-state.yaml].include?(File.basename(path).downcase)
    end

    def excluded?(path, roots)
      components = path.split("/")
      roots.any? do |prefix|
        path == prefix || path.start_with?("#{prefix}/") || (!prefix.include?("/") && components.include?(prefix))
      end
    end

    def dated_evidence?(path, roots)
      roots.any? do |prefix|
        (path == prefix || path.start_with?("#{prefix}/")) && path.match?(/\d{4}-\d{2}(?:-\d{2})?/)
      end
    end

    def link_errors(relative)
      content = File.read(absolute(relative))
      content.scan(/!?\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)/).flatten.each_with_object([]) do |target, errors|
        next if target.match?(/\A(?:https?:|mailto:|tel:)/i)
        destination = File.expand_path(target.gsub("%20", " "), File.dirname(absolute(relative)))
        errors << "Broken local link in #{relative}: #{target}" unless File.exist?(destination)
      end
    end

    def absolute(relative)
      File.join(root, relative)
    end
  end

  def self.run(argv)
    if argv == ["--version"]
      puts VERSION
      return 0
    end
    unless argv.empty? || argv == ["check"]
      warn "Usage: ruby scripts/truth_audit.rb [check|--version]"
      return 2
    end
    errors = Repository.new.check
    if errors.empty?
      puts "Truth Audit passed."
      0
    else
      warn "Truth Audit failed:"
      errors.each { |error| warn "- #{error}" }
      1
    end
  end
end

exit TruthAudit.run(ARGV) if $PROGRAM_NAME == __FILE__
