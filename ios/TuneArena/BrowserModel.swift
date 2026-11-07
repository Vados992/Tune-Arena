import Foundation
import Combine
import WebKit
import UIKit

@MainActor
final class BrowserModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    @Published var server: URL
    @Published var host = "Tune Arena"
    @Published var loading = false
    @Published var errorMessage: String?

    override init() {
        let bundled = Bundle.main.url(forResource: "ServerConfig", withExtension: "json")!
        let data = try! Data(contentsOf: bundled)
        let defaults = try! JSONDecoder().decode(ServerConfig.self, from: data)
        server = try! Self.normalize(UserDefaults.standard.string(forKey: "TuneArenaServer") ?? defaults.appUrl)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .black
    }
    private struct ServerConfig: Decodable { let appUrl: String }
    static func normalize(_ value: String) throws -> URL {
        guard var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
            parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
            parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
            parts.path.isEmpty || parts.path == "/" else { throw URLError(.badURL) }
        parts.scheme = "https"; parts.host = host.lowercased(); parts.path = ""
        if parts.port == 443 { parts.port = nil }
        guard let result = parts.url else { throw URLError(.badURL) }
        return result
    }
    private func sameOrigin(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host?.lowercased() == server.host?.lowercased()
            && (url.port ?? 443) == (server.port ?? 443) && url.user == nil && url.password == nil
    }
    func home() { errorMessage = nil; webView.load(URLRequest(url: server)) }
    func changeServer(_ value: String) throws {
        server = try Self.normalize(value)
        UserDefaults.standard.set(server.absoluteString, forKey: "TuneArenaServer")
        home()
    }
    func openLoginLink(_ value: String) throws {
        guard let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)), sameOrigin(url) else { throw URLError(.badURL) }
        errorMessage = nil; webView.load(URLRequest(url: url))
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "https", url.user == nil, url.password == nil { decisionHandler(.allow) }
        else if url.scheme == "mailto" { UIApplication.shared.open(url); decisionHandler(.cancel) }
        else { decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil, let url = action.request.url, ["https", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let permitted = origin.protocol == "https" && origin.host.lowercased() == server.host?.lowercased()
            && (origin.port == 0 ? 443 : origin.port) == (server.port ?? 443)
            && frame.isMainFrame && type == .camera && webView.url.map(sameOrigin) == true
        decisionHandler(permitted ? .prompt : .deny)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { loading = true; errorMessage = nil }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false; host = webView.url?.host ?? "Tune Arena" }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    private func failed(_ error: Error) { loading = false; if (error as NSError).code != NSURLErrorCancelled { errorMessage = "Проверьте интернет и доступ к выбранному серверу." } }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loading = false; errorMessage = "Страница остановлена системой. Нажмите «Повторить»." }
}
