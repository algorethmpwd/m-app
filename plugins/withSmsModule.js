const fs = require('fs');
const path = require('path');
const { withMainApplication, withAndroidManifest } = require('@expo/config-plugins');

const withSmsModule = (config) => {
  // 1. Android Manifest changes
  config = withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    // Add RECEIVE_SMS permission
    const hasReceiveSms = androidManifest.manifest['uses-permission'].some(
      (p) => p.$['android:name'] === 'android.permission.RECEIVE_SMS'
    );
    if (!hasReceiveSms) {
      androidManifest.manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.RECEIVE_SMS' },
      });
    }

    // Add SmsReceiver under application block
    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }
    const hasSmsReceiver = mainApplication.receiver.some(
      (r) => r.$['android:name'] === '.SmsReceiver'
    );
    if (!hasSmsReceiver) {
      mainApplication.receiver.push({
        $: {
          'android:name': '.SmsReceiver',
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' },
            action: [
              { $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } },
            ],
          },
        ],
      });
    }

    return modConfig;
  });

  // 2. MainApplication and Source Code generation
  config = withMainApplication(config, (modConfig) => {
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

    // SmsReceiver.kt (Real-time background SMS interception)
    const smsReceiverContent = `package ${packageName}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import java.io.File
import java.util.Locale
import java.util.Random
import org.json.JSONArray
import org.json.JSONObject

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            if (messages != null) {
                for (message in messages) {
                    val body = message.messageBody
                    val sender = message.originatingAddress ?: ""
                    val senderUpper = sender.uppercase(Locale.US)
                    val date = message.timestampMillis

                    val isMpesa = senderUpper.contains("MPESA") || senderUpper.contains("M-PESA")
                    val isBank = senderUpper.contains("EQUITY") || senderUpper.contains("EQUITEL") || 
                                 senderUpper.contains("KCB") || senderUpper.contains("COOP") || 
                                 senderUpper.contains("NCBA") || senderUpper.contains("ABSA")

                    if (isMpesa || isBank) {
                        Log.d("SmsReceiver", "Real-time sync: transactional SMS from $sender")
                        
                        // Queue SMS to local pending background syncs file
                        savePendingSms(context, body, sender, date)
                        
                        // Trigger native local push notification
                        NotificationHelper.showNotification(
                            context,
                            "Sync Complete",
                            "A new transactional statement was auto-imported."
                        )
                    }
                }
            }
        }
    }

    private fun savePendingSms(context: Context, body: String, sender: String, date: Long) {
        try {
            val file = File(context.filesDir, "pending_background_syncs.json")
            val array = if (file.exists()) {
                JSONArray(file.readText())
            } else {
                JSONArray()
            }

            val randomVal = Random().nextInt(900) + 100
            val obj = JSONObject()
            obj.put("body", body)
            obj.put("address", sender)
            obj.put("date", date)
            obj.put("id", "BG_" + System.currentTimeMillis() + "_" + randomVal)
            array.put(obj)

            file.writeText(array.toString())
        } catch (e: Exception) {
            Log.e("SmsReceiver", "Failed to queue background SMS", e)
        }
    }
}`;

    // NotificationHelper.kt (Android push notifications helper)
    const notificationHelperContent = `package ${packageName}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

object NotificationHelper {
    private const val CHANNEL_ID = "transaction_alerts"
    private const val CHANNEL_NAME = "Transaction Syncs"
    private const val NOTIFICATION_ID = 2002

    fun showNotification(context: Context, title: String, text: String) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT)
            notificationManager.createNotificationChannel(channel)
        }

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Try using default app icon
        val iconResId = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
            .let { if (it != 0) it else android.R.drawable.ic_dialog_info }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(iconResId)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }
}`;

    fs.writeFileSync(path.join(destDir, 'SmsModule.kt'), smsModuleContent, 'utf8');
    fs.writeFileSync(path.join(destDir, 'SmsPackage.kt'), smsPackageContent, 'utf8');
    fs.writeFileSync(path.join(destDir, 'SmsReceiver.kt'), smsReceiverContent, 'utf8');
    fs.writeFileSync(path.join(destDir, 'NotificationHelper.kt'), notificationHelperContent, 'utf8');

    let contents = modConfig.modResults.contents;

    // Clean up any un-fully-qualified package registration from previous builds
    if (contents.includes('add(SmsPackage())')) {
      contents = contents.replace('add(SmsPackage())', `add(${packageName}.SmsPackage())`);
    }

    if (!contents.includes(`add(${packageName}.SmsPackage())`)) {
      const target = 'PackageList(this).packages.apply {';
      contents = contents.replace(
        target,
        `${target}\n              add(${packageName}.SmsPackage())`
      );
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });

  return config;
};

module.exports = withSmsModule;
