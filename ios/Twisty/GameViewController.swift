import UIKit
import WebKit

final class GameViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private static let saveKeys = [
        "twisty-timer-v1", "twisty-best-v1", "twisty-loop-v1", "twisty-mute-v1"
    ]
    private static let messageName = "twisty"
    private let gameURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Game")
    private let defaults = UserDefaults.standard
    private var webView: WKWebView!

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.allowsInlineMediaPlayback = true
        let controller = configuration.userContentController
        controller.add(WeakMessageHandler(target: self), name: Self.messageName)
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.37, green: 0.50, blue: 0.62, alpha: 1)
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view = webView
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if webView.url == nil && !webView.isLoading && presentedViewController == nil { loadGame() }
    }

    private func loadGame() {
        guard let gameURL else {
            showLoadError()
            return
        }
        let saved = Dictionary(uniqueKeysWithValues: Self.saveKeys.compactMap { key in
            defaults.string(forKey: key).map { (key, $0) }
        })
        let data = try? JSONEncoder().encode(saved)
        let initialValues = data.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let source = """
        (() => {
          const saved = new Map(Object.entries(\(initialValues)));
          const send = (body) => window.webkit.messageHandlers.twisty.postMessage(body);
          let paused = false;
          window.twistyHost = {
            storage: {
              getItem: (key) => saved.get(key) ?? null,
              setItem: (key, value) => {
                saved.set(key, value);
                send({ action: 'save', key, value });
              }
            },
            get paused() { return paused; },
            setPaused: (value) => {
              paused = value;
              document.dispatchEvent(new Event('twisty-pause'));
            },
            open: (action) => send({ action })
          };
        })();
        """
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.loadFileURL(gameURL, allowingReadAccessTo: gameURL)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard action.targetFrame?.isMainFrame == true,
              let gameURL, action.request.url?.standardizedFileURL == gameURL.standardizedFileURL
        else { return .cancel }
        return .allow
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        showLoadError()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        showLoadError()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showLoadError()
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.messageName, message.frameInfo.isMainFrame,
              let gameURL, message.frameInfo.request.url?.standardizedFileURL == gameURL.standardizedFileURL,
              let body = message.body as? [String: String]
        else { return }
        switch body["action"] {
        case "save":
            guard let key = body["key"], Self.saveKeys.contains(key),
                  let value = body["value"], value.utf8.count <= 4096 else { return }
            defaults.set(value, forKey: key)
        case "pause":
            showPauseMenu()
        case "privacy":
            showPrivacy()
        default:
            break
        }
    }

    private func setPaused(_ paused: Bool) {
        webView.evaluateJavaScript("window.twistyHost.setPaused(\(paused))")
    }

    private func showPauseMenu() {
        guard presentedViewController == nil else { return }
        setPaused(true)
        let menu = UIAlertController(title: "Game paused", message: nil, preferredStyle: .alert)
        menu.addAction(UIAlertAction(title: "Resume", style: .cancel) { [weak self] _ in
            self?.setPaused(false)
        })
        menu.addAction(UIAlertAction(title: "End this run", style: .destructive) { [weak self] _ in
            self?.loadGame()
        })
        present(menu, animated: true)
    }

    private func showPrivacy() {
        guard presentedViewController == nil else { return }
        let notice = UIAlertController(
            title: "Privacy",
            message: "Twisty’s Tornado works offline. It has no accounts, ads, or analytics and sends no gameplay data. Your sound setting, timer choice, best times, and unlocked worlds stay on this device.",
            preferredStyle: .alert
        )
        notice.addAction(UIAlertAction(title: "Done", style: .cancel))
        present(notice, animated: true)
    }

    private func showLoadError() {
        guard presentedViewController == nil else { return }
        let error = UIAlertController(
            title: "The game couldn’t load",
            message: "Try restarting the game. Your saved settings and best times will stay on this device.",
            preferredStyle: .alert
        )
        error.addAction(UIAlertAction(title: "Restart", style: .default) { [weak self] _ in
            self?.loadGame()
        })
        present(error, animated: true)
    }
}

// WebKit retains its message handler for as long as the view exists.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: GameViewController?

    init(target: GameViewController) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
