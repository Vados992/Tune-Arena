import SwiftUI
import WebKit

@main
struct TuneArenaApp: App {
    @StateObject private var model = BrowserModel()
    var body: some Scene { WindowGroup { ArenaView(model: model) } }
}

struct ArenaWebView: UIViewRepresentable {
    @ObservedObject var model: BrowserModel
    func makeUIView(context: Context) -> WKWebView { model.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct ArenaView: View {
    @ObservedObject var model: BrowserModel
    @State private var settings = false
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.home() } label: { Image(systemName: "house") }.accessibilityLabel("Главная")
                Spacer()
                Text(model.host).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                if model.loading { ProgressView().scaleEffect(0.7) }
                Spacer()
                Button { settings = true } label: { Image(systemName: "slider.horizontal.3") }.accessibilityLabel("Настройки")
            }.padding(.horizontal, 18).frame(height: 42)
            ZStack {
                ArenaWebView(model: model)
                if let error = model.errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                        Text("Не удалось открыть Tune Arena").font(.headline)
                        Text(error).font(.caption).multilineTextAlignment(.center)
                        Button("Повторить") { model.home() }.buttonStyle(.borderedProminent)
                    }.padding(30).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(.systemBackground))
                }
            }
        }
        .tint(.orange)
        .sheet(isPresented: $settings) { ClientSettings(model: model) }
        .onAppear { if model.webView.url == nil { model.home() } }
    }
}

struct ClientSettings: View {
    @ObservedObject var model: BrowserModel
    @Environment(\.dismiss) private var dismiss
    @State private var server = ""
    @State private var link = ""
    @State private var error = ""
    var body: some View {
        NavigationStack {
            Form {
                Section("Сервер Tune Arena") {
                    TextField("https://your-server.example", text: $server).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Сохранить сервер") { do { try model.changeServer(server); dismiss() } catch { self.error = "Нужен HTTPS-адрес сервера без пути и параметров." } }
                }
                Section("Вход по ссылке из письма") {
                    TextField("Вставить ссылку для входа", text: $link).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive()
                    Button("Открыть в приложении") { do { try model.openLoginLink(link); link = ""; dismiss() } catch { self.error = "Ссылка должна принадлежать выбранному серверу." } }
                    Text("Используйте ссылку, запрошенную в этом приложении. Она не сохраняется.").font(.caption)
                }
                Section {
                    Button("Обновить страницу") { model.webView.reload(); dismiss() }
                    Button("Открыть в Safari") { UIApplication.shared.open(model.server); dismiss() }
                    Text("Для конкурсов нужен интернет. Для приватного пилота нужен разрешённый аккаунт. Камера включается только после вашего разрешения.").font(.caption)
                }
                if !error.isEmpty { Text(error).foregroundStyle(.red).font(.caption) }
            }
            .navigationTitle("Tune Arena")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
            .onAppear { server = model.server.absoluteString }
        }
    }
}
