package live.miracleapp.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // No scrollbar on the side of the screen: pages still scroll, like a native app.
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return; // no WebView on this phone: Capacitor shows its own screen
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        openShared(getIntent());
    }

    // The app was already open when something was shared to it.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openShared(intent);
    }

    /**
     * WhatsApp (or any app) › Share › Miracle: the shared message opens in Add collab, already read
     * (the web app's /studio/share page, the same one the installed web app's share menu uses).
     */
    private void openShared(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null || text.length() == 0) return;
        String body = text.toString();
        if (body.length() > 8000) body = body.substring(0, 8000); // a long chat: the latest part is what matters
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;
        // Her own address when the app is on it (sign-in is shared across Miracle's addresses), else the app's.
        String base = "https://app.miracleapp.live";
        String now = web.getUrl();
        if (now != null) {
            Uri u = Uri.parse(now);
            String host = u.getHost();
            if ("https".equals(u.getScheme()) && host != null && (host.equals("miracleapp.live") || host.endsWith(".miracleapp.live"))) base = "https://" + host;
        }
        Uri.Builder link = Uri.parse(base + "/studio/share").buildUpon().appendQueryParameter("text", body);
        if (subject != null && !subject.isEmpty()) link.appendQueryParameter("title", subject);
        String url = link.build().toString();
        // After the app's first page has started, so the shared one replaces it.
        web.post(() -> web.loadUrl(url));
        // Handled: turning the phone or coming back doesn't open it again.
        intent.setAction(Intent.ACTION_MAIN);
    }
}
