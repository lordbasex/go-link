// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>
package org.golink.player.ui

import android.annotation.SuppressLint
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import org.golink.player.Prefs
import org.golink.player.R
import org.golink.player.core.InviteTarget
import org.golink.player.core.Invites
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Reads the invitation's QR code. The camera permission is asked only
 * here, after an explanation; without it the person types the code.
 */
@Composable
fun ScanScreen(prefs: Prefs, onFound: (InviteTarget) -> Unit, onType: () -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    var granted by rememberGranted(Perms.CAMERA)
    var denied by remember { mutableStateOf(false) }
    var explained by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        prefs.markAsked(Perms.CAMERA)
        granted = ok
        denied = !ok
    }
    Column(Modifier.fillMaxSize().safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back), tint = Tokens.text)
            }
            Text(stringResource(R.string.scan_title), color = Tokens.text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            when {
                granted -> Scanner(onFound, onType)
                !explained || denied -> PermissionExplainer(
                    icon = Icons.Filled.PhotoCamera,
                    title = stringResource(R.string.perm_camera_title),
                    text = stringResource(R.string.perm_camera_text),
                    allow = stringResource(if (denied) R.string.perm_open_settings else R.string.perm_allow),
                    notNow = stringResource(R.string.scan_type_instead),
                    note = if (denied) stringResource(R.string.perm_camera_denied) else null,
                    onAllow = {
                        explained = true
                        if (denied) Perms.openAppSettings(context) else launcher.launch(Perms.CAMERA)
                    },
                    onNotNow = onType,
                )
                else -> Unit
            }
        }
    }
}

@SuppressLint("UnsafeOptInUsageError")
@Composable
private fun Scanner(onFound: (InviteTarget) -> Unit, onType: () -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    var invalid by remember { mutableStateOf(false) }
    val done = remember { AtomicBoolean(false) }
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }
    DisposableEffect(Unit) {
        onDispose {
            scanner.close()
            executor.shutdown()
        }
    }
    Column(
        Modifier.widthIn(max = 480.dp).fillMaxWidth().padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.scan_hint), color = Tokens.muted, fontSize = 15.sp)
        Surface(
            modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(20.dp)),
            color = Tokens.video,
            border = BorderStroke(2.dp, Tokens.accent),
        ) {
            AndroidView(
                factory = { ctx ->
                    val view = PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
                    val future = ProcessCameraProvider.getInstance(ctx)
                    future.addListener({
                        val provider = future.get()
                        val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
                        val analysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                        analysis.setAnalyzer(executor) { proxy ->
                            val media = proxy.image
                            if (media == null || done.get()) {
                                proxy.close()
                                return@setAnalyzer
                            }
                            val image = InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees)
                            scanner.process(image)
                                .addOnSuccessListener { codes ->
                                    val texts = codes.mapNotNull { it.rawValue }
                                    // Only a go-link invitation is accepted: never a
                                    // server address, a PIN or another site.
                                    val target = texts.firstNotNullOfOrNull { Invites.parseScanned(it) }
                                    if (target != null && done.compareAndSet(false, true)) {
                                        ContextCompat.getMainExecutor(ctx).execute { onFound(target) }
                                    } else if (texts.isNotEmpty()) {
                                        invalid = true
                                    }
                                }
                                .addOnCompleteListener { proxy.close() }
                        }
                        runCatching {
                            provider.unbindAll()
                            provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                        }
                    }, ContextCompat.getMainExecutor(ctx))
                    view
                },
                onRelease = { ProcessCameraProvider.getInstance(context).get().unbindAll() },
                modifier = Modifier.fillMaxSize(),
            )
            Box(Modifier.fillMaxSize().padding(48.dp).border(2.dp, Tokens.accent.copy(alpha = 0.6f), RoundedCornerShape(16.dp)))
        }
        if (invalid) Notice(stringResource(R.string.scan_invalid), danger = true)
        Spacer(Modifier.size(4.dp))
        SecondaryButton(stringResource(R.string.scan_type_instead), onType, Modifier.fillMaxWidth())
    }
}
