package io.tuman.attendance;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.MifareClassic;
import android.os.Bundle;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

/**
 * NFC tag delivery for this app.
 *
 * Android's reader mode is a single global slot on the NFC adapter: the last
 * app that calls `enableReaderMode()` owns it. Some OEM builds (OPPO/ColorOS)
 * additionally register their own callback with the NFC service so that MIFARE
 * Classic cards - which their card feature wants to recognise - are handed to
 * that feature instead of the app that armed the reader.
 *
 * Two ways of receiving a tag are supported:
 *
 * 1. `callback` - the documented reader mode. The callback is invoked by the
 *    NFC service in this process.
 * 2. `pending` - the older `enableReaderMode(Activity, PendingIntent, ...)`
 *    variant. It is not part of the public SDK any more, so it is called
 *    reflectively when the platform still has it. The tag arrives as an
 *    internal broadcast.
 *
 * A tag can also be handed to the foreground activity as a plain
 * `TAG_DISCOVERED` intent; that path is handled in {@link #handleOnNewIntent}.
 */
@CapacitorPlugin(name = "TumanNfcDispatch")
public class TumanNfcDispatchPlugin extends Plugin {

    private static final String TAG = "TumanNfc";

    /** Internal broadcast the NFC service sends the tag to. */
    private static final String ACTION_TAG = "io.tuman.attendance.NFC_TAG";

    private static final int READER_FLAGS = NfcAdapter.FLAG_READER_NFC_A
            | NfcAdapter.FLAG_READER_NFC_B
            | NfcAdapter.FLAG_READER_NFC_F
            | NfcAdapter.FLAG_READER_NFC_V;

    /** Delivered by the reader callback variant. */
    private final NfcAdapter.ReaderCallback readerCallback = tag -> {
        Log.i(TAG, "reader callback fired, uid=" + hex(tag.getId()));
        emit(tag);
    };

    private BroadcastReceiver receiver;
    private boolean readerActive = false;
    private String mode = "callback";

    /**
     * Take the reader slot and report every tag.
     *
     * @param mode `callback` (default) or `pending`.
     */
    @PluginMethod
    public void startScanning(PluginCall call) {
        final NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        final Activity activity = getActivity();
        if (adapter == null) {
            call.reject("This device does not have NFC hardware.");
            return;
        }
        if (activity == null) {
            call.reject("The app is not in the foreground.");
            return;
        }

        int flags = call.getInt("androidReaderModeFlags", READER_FLAGS);
        String requested = call.getString("mode", "callback");
        mode = "pending".equals(requested) ? "pending" : "callback";

        Bundle extras = new Bundle();
        extras.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 100);

        if ("pending".equals(mode)) {
            if (!registerReceiver()) {
                call.reject("Could not listen for NFC tags.");
                return;
            }
        }

        activity.runOnUiThread(() -> {
            try {
                if ("pending".equals(mode)) {
                    enableWithPendingIntent(activity, adapter, flags, extras);
                } else {
                    adapter.enableReaderMode(activity, readerCallback, flags, extras);
                    Log.i(TAG, "reader mode enabled (callback), flags=" + flags);
                }
                readerActive = true;
                call.resolve();
            } catch (Exception ex) {
                Log.w(TAG, "could not start the reader", ex);
                call.reject("Could not start the NFC reader.", ex);
            }
        });
    }

    /** Release the reader slot again. */
    @PluginMethod
    public void stopScanning(PluginCall call) {
        final NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        final Activity activity = getActivity();
        if (adapter != null && activity != null) {
            activity.runOnUiThread(() -> {
                try {
                    adapter.disableReaderMode(activity);
                } catch (Exception ex) {
                    Log.w(TAG, "could not disable the reader", ex);
                }
            });
        }
        readerActive = false;
        unregisterReceiver();
        call.resolve();
    }

    /** True while this plugin owns the reader slot. */
    @PluginMethod
    public void isScanning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("scanning", readerActive);
        result.put("mode", mode);
        call.resolve(result);
    }

    /** Simple health check used by the web layer to detect the native fallback. */
    @PluginMethod
    public void ping(PluginCall call) {
        call.resolve();
    }

    /**
     * The `PendingIntent` variant of reader mode is not part of the public SDK
     * any more, so it is called reflectively. The platform keeps the method for
     * apps that were built against an older SDK.
     */
    private void enableWithPendingIntent(Activity activity, NfcAdapter adapter, int flags, Bundle extras) throws Exception {
        Method method = NfcAdapter.class.getMethod(
                "enableReaderMode", Activity.class, PendingIntent.class, int.class, Bundle.class);

        Intent intent = new Intent(ACTION_TAG).setPackage(getContext().getPackageName());
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                getContext(),
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);

        try {
            method.invoke(adapter, activity, pendingIntent, flags, extras);
            Log.i(TAG, "reader mode enabled (pending intent), flags=" + flags);
        } catch (InvocationTargetException ex) {
            throw ex.getCause() instanceof Exception ? (Exception) ex.getCause() : ex;
        }
    }

    /**
     * Some devices hand the tag to the foreground activity instead of the
     * reader. The app declares the TAG_DISCOVERED intent filter, so that path
     * ends up here as well.
     */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);

        if (intent == null) {
            return;
        }

        String action = intent.getAction();
        if (!NfcAdapter.ACTION_TAG_DISCOVERED.equals(action) && !NfcAdapter.ACTION_TECH_DISCOVERED.equals(action)) {
            return;
        }

        Tag tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG);
        if (tag != null) {
            Log.i(TAG, "tag delivered through the activity intent, uid=" + hex(tag.getId()));
            emit(tag);
        }
    }

    private boolean registerReceiver() {
        if (receiver != null) {
            return true;
        }
        try {
            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    Tag tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG);
                    if (tag != null) {
                        Log.i(TAG, "tag delivered through the broadcast, uid=" + hex(tag.getId()));
                        emit(tag);
                    }
                }
            };
            IntentFilter filter = new IntentFilter(ACTION_TAG);
            ContextCompat.registerReceiver(
                    getContext(), receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
            return true;
        } catch (Exception ex) {
            Log.w(TAG, "could not register the tag receiver", ex);
            receiver = null;
            return false;
        }
    }

    private void unregisterReceiver() {
        if (receiver == null) {
            return;
        }
        try {
            getContext().unregisterReceiver(receiver);
        } catch (Exception ex) {
            /* ignored - already gone */
        }
        receiver = null;
    }

    /**
     * Report a tag to the web layer. The event is retained until the web layer
     * listens, so a card that opened the app is not lost.
     */
    private void emit(Tag tag) {
        JSObject event = new JSObject();
        event.put("tag", toPayload(tag));
        notifyListeners("tagDiscovered", event, true);
    }

    private JSObject toPayload(Tag tag) {
        JSObject payload = new JSObject();

        byte[] id = tag.getId();
        JSArray idBytes = new JSArray();
        if (id != null) {
            for (byte value : id) {
                idBytes.put(value & 0xff);
            }
        }
        payload.put("id", idBytes);

        String[] techList = tag.getTechList();
        JSArray techTypes = new JSArray();
        for (String tech : techList) {
            techTypes.put(tech);
        }
        payload.put("techTypes", techTypes);

        String type = describe(tag);
        if (type != null) {
            payload.put("type", type);
        }

        return payload;
    }

    private String describe(Tag tag) {
        String[] techList = tag.getTechList();
        for (String tech : techList) {
            if (MifareClassic.class.getName().equals(tech)) {
                return "MIFARE Classic";
            }
        }
        return techList.length > 0 ? techList[0] : null;
    }

    private static String hex(byte[] id) {
        if (id == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (byte value : id) {
            builder.append(String.format("%02X", value));
        }
        return builder.toString();
    }
}
