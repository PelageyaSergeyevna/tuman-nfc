package io.tuman.attendance;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin: it has to be registered before the bridge is created,
        // which happens inside BridgeActivity.onCreate().
        registerPlugin(TumanNfcDispatchPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
