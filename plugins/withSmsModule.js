const fs = require('fs');
const path = require('path');
const { withMainApplication } = require('@expo/config-plugins');

const withSmsModule = (config) => {
  return withMainApplication(config, (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const packageName = config.android?.package || 'com.usersapp';
    const packagePath = packageName.replace(/\./g, '/');
    const destDir = path.join(
      projectRoot,
      'android/app/src/main/java',
      packagePath
    );

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // SmsModule.kt
    const smsModuleContent = `package ${packageName}

import android.content.Context
import android.database.Cursor
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

class SmsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SmsModule"
    }

    @ReactMethod
    fun getSmsList(limit: Int, promise: Promise) {
        val smsList: WritableArray = Arguments.createArray()
        val cursor: Cursor? = reactApplicationContext.contentResolver.query(
            Uri.parse("content://sms/inbox"),
            arrayOf("_id", "address", "body", "date"),
            null,
            null,
            "date DESC LIMIT $limit"
        )

        try {
            if (cursor != null && cursor.moveToFirst()) {
                val idIndex = cursor.getColumnIndex("_id")
                val addressIndex = cursor.getColumnIndex("address")
                val bodyIndex = cursor.getColumnIndex("body")
                val dateIndex = cursor.getColumnIndex("date")
                
                do {
                    val map: WritableMap = Arguments.createMap()
                    if (idIndex != -1) map.putString("id", cursor.getString(idIndex))
                    if (addressIndex != -1) map.putString("address", cursor.getString(addressIndex))
                    if (bodyIndex != -1) map.putString("body", cursor.getString(bodyIndex))
                    if (dateIndex != -1) map.putDouble("date", cursor.getLong(dateIndex).toDouble())
                    smsList.pushMap(map)
                } while (cursor.moveToNext())
            }
            promise.resolve(smsList)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", e.message, e)
        } finally {
            cursor?.close()
        }
    }
}`;

    // SmsPackage.kt
    const smsPackageContent = `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import java.util.ArrayList

class SmsPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        val modules = ArrayList<NativeModule>()
        modules.add(SmsModule(reactContext))
        return modules
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}`;

    fs.writeFileSync(path.join(destDir, 'SmsModule.kt'), smsModuleContent, 'utf8');
    fs.writeFileSync(path.join(destDir, 'SmsPackage.kt'), smsPackageContent, 'utf8');

    let contents = modConfig.modResults.contents;

    if (!contents.includes('add(SmsPackage())')) {
      const target = 'PackageList(this).packages.apply {';
      contents = contents.replace(
        target,
        `${target}\n              add(SmsPackage())`
      );
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
};

module.exports = withSmsModule;
