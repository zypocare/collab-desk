package live.miracleapp.app;

import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private volatile String pendingSharedReelJson = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge to edge on every Android version, as Android 15 and newer do anyway: the page draws behind the
        // clock and the buttons, and Capacitor's SystemBars tells it how much room they take (insetsHandling
        // "css"). Light icons to start, over the dark splash; the web app then matches them to its look.
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
        // No scrollbar on the side of the screen: pages still scroll, like a native app.
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return; // no WebView on this phone: Capacitor shows its own screen
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.addJavascriptInterface(new ShareBridge(), "MiracleShare");
        openShared(getIntent());
    }

    // The app was already open when something was shared to it.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openShared(intent);
    }

    public class ShareBridge {
        @JavascriptInterface
        public String consumeSharedReel() {
            String out = pendingSharedReelJson;
            pendingSharedReelJson = null;
            return out != null ? out : "";
        }
    }

    private String resolveBaseUrl(WebView web) {
        String base = "https://app.miracleapp.live";
        String now = web.getUrl();
        if (now != null) {
            Uri u = Uri.parse(now);
            String host = u.getHost();
            if ("https".equals(u.getScheme()) && host != null && (host.equals("miracleapp.live") || host.endsWith(".miracleapp.live"))) {
                base = "https://" + host;
            }
        }
        return base;
    }

    /**
     * Handles Share › Miracle for:
     * 1) text/plain (WhatsApp / DMs) -> /studio/share
     * 2) video/* (Instagram Edits / CapCut / VN / InShot) -> extracts 0.2s, 2.0s, 4.5s frames + duration -> /studio/grow/check?shared=1
     */
    @SuppressWarnings("deprecation")
    private void openShared(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null) return;
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) return;

        if (type.startsWith("text/")) {
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text == null || text.length() == 0) return;
            String body = text.toString();
            if (body.length() > 8000) body = body.substring(0, 8000);
            String base = resolveBaseUrl(web);
            Uri.Builder link = Uri.parse(base + "/studio/share").buildUpon().appendQueryParameter("text", body);
            if (subject != null && !subject.isEmpty()) link.appendQueryParameter("title", subject);
            String url = link.build().toString();
            web.post(() -> web.loadUrl(url));
            intent.setAction(Intent.ACTION_MAIN);
            return;
        }

        if (type.startsWith("video/")) {
            Uri videoUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (videoUri == null) return;
            intent.setAction(Intent.ACTION_MAIN);
            final String base = resolveBaseUrl(web);
            new Thread(() -> {
                String payload = extractReelPayload(videoUri);
                if (payload == null) return;
                pendingSharedReelJson = payload;
                String url = base + "/studio/grow/check?shared=1&t=" + System.currentTimeMillis();
                web.post(() -> web.loadUrl(url));
            }).start();
        }
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String name = c.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {}
        return "Edits Reel.mp4";
    }

    private String extractReelPayload(Uri uri) {
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(this, uri);
            String durStr = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            long durMs = durStr != null ? Long.parseLong(durStr) : 0L;
            int seconds = (int) Math.round(durMs / 1000.0);

            long[] marksUs;
            if (durMs >= 4800) {
                marksUs = new long[] { 200_000L, 2_000_000L, 4_500_000L };
            } else if (durMs >= 2200) {
                marksUs = new long[] { 200_000L, 2_000_000L };
            } else {
                marksUs = new long[] { Math.max(50_000L, durMs * 250L) };
            }
            String[] labels = new String[] { "0.2s", "2.0s", "4.5s" };

            JSONArray frames = new JSONArray();
            for (int i = 0; i < marksUs.length; i++) {
                Bitmap bmp = mmr.getFrameAtTime(marksUs[i], MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                if (bmp == null) continue;
                int targetW = 360;
                int targetH = Math.max(1, Math.round((float) bmp.getHeight() / Math.max(1, bmp.getWidth()) * targetW));
                Bitmap scaled = Bitmap.createScaledBitmap(bmp, targetW, targetH, true);
                if (scaled != bmp) bmp.recycle();
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                scaled.compress(Bitmap.CompressFormat.JPEG, 72, baos);
                scaled.recycle();
                String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                JSONObject f = new JSONObject();
                f.put("label", labels[i]);
                f.put("at", marksUs[i] / 1_000_000.0);
                f.put("data", "data:image/jpeg;base64," + b64);
                frames.put(f);
            }

            JSONObject out = new JSONObject();
            out.put("name", queryDisplayName(uri));
            out.put("seconds", seconds);
            out.put("source", "edits");
            out.put("frames", frames);
            return out.toString();
        } catch (Exception e) {
            return null;
        } finally {
            try { mmr.release(); } catch (Exception ignored) {}
        }
    }
}
