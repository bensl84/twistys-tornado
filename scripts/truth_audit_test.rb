#!/usr/bin/env ruby

require "fileutils"
require "minitest/autorun"
require "tmpdir"

require_relative "truth_audit"

class TruthAuditTest < Minitest::Test
  def setup
    @root = Dir.mktmpdir("truth-audit-")
    write("README.md", "# App\n")
    write(
      ".truth-audit.yml",
      <<~YAML
        max_documents: 2
        maintained_documents:
          - README.md
        evidence_roots: []
        excluded_roots: []
      YAML
    )
  end

  def teardown
    FileUtils.remove_entry(@root)
  end

  def test_clean_registered_set_passes
    assert_empty repository.check
  end

  def test_unclassified_document_fails
    write("notes/other.md", "# Other\n")
    assert repository.check.any? { |error| error.include?("Unclassified documentation: notes/other.md") }
  end

  def test_broken_local_link_fails
    write("README.md", "[Missing](docs/missing.md)\n")
    assert repository.check.any? { |error| error.include?("Broken local link in README.md") }
  end

  def test_checker_has_recorded_version
    assert_equal "2.0.0", TruthAudit::VERSION
  end

  private

  def repository
    TruthAudit::Repository.new(@root)
  end

  def write(path, content)
    full = File.join(@root, path)
    FileUtils.mkdir_p(File.dirname(full))
    File.write(full, content)
  end
end
