package expo.modules.amapmap

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.amap.api.maps.offlinemap.OfflineMapCity
import com.amap.api.maps.offlinemap.OfflineMapManager
import com.amap.api.maps.offlinemap.OfflineMapStatus
import com.autonavi.base.amap.mapcore.FileUtil
import java.io.File

private const val OFFLINE_TAG = "MemoraeNingboOffline"
private const val NINGBO_CITY_NAME = "宁波市"
private const val NINGBO_PINYIN = "ningbo"
private const val CONFIRMATION_ATTEMPTS = 8
private const val CONFIRMATION_DELAY_MS = 250L

internal fun isNingboOfflineCity(name: String?, pinyin: String?): Boolean {
  val normalizedName = name?.trim()?.removeSuffix("市")
  return normalizedName == "宁波" || pinyin?.trim()?.equals(NINGBO_PINYIN, ignoreCase = true) == true
}

internal fun offlineStateForStatus(status: Int): String = when (status) {
  OfflineMapStatus.SUCCESS -> "downloaded"
  OfflineMapStatus.LOADING,
  OfflineMapStatus.UNZIP,
  OfflineMapStatus.WAITING,
  OfflineMapStatus.PAUSE,
  OfflineMapStatus.CHECKUPDATES,
  OfflineMapStatus.NEW_VERSION,
  -> "downloading"
  OfflineMapStatus.ERROR,
  OfflineMapStatus.EXCEPTION_NETWORK_LOADING,
  OfflineMapStatus.EXCEPTION_AMAP,
  OfflineMapStatus.EXCEPTION_SDCARD,
  OfflineMapStatus.START_DOWNLOAD_FAILD,
  OfflineMapStatus.STOP,
  -> "failed"
  else -> "failed"
}

internal class NingboOfflineMapController(
  context: Context,
  private val emitToJs: (Map<String, Any>) -> Unit,
) {
  private val applicationContext = context.applicationContext
  private val handler = Handler(Looper.getMainLooper())
  private var manager: OfflineMapManager? = null
  private var cityListVerified = false
  private var pendingDownload = false
  private var disposed = false

  private val downloadListener = object : OfflineMapManager.OfflineMapDownloadListener {
    override fun onDownload(status: Int, completeCode: Int, downloadName: String?) {
      if (disposed || !matchesNingboCallback(downloadName)) return
      if (status == OfflineMapStatus.SUCCESS) {
        confirmDownloaded(CONFIRMATION_ATTEMPTS)
        return
      }

      val city = resolveNingboCity()
      val state = offlineStateForStatus(status)
      val message = when (state) {
        "downloading" -> "Ningbo offline map download in progress"
        else -> "Ningbo offline map download failed"
      }
      emit(
        payload(
          state = state,
          city = city,
          progress = completeCode.coerceIn(0, 100),
          statusCode = status,
          errorCode = status.takeIf { state == "failed" }?.toString(),
          message = message,
        ),
      )
    }

    override fun onCheckUpdate(hasNewVersion: Boolean, cityName: String?) {
      if (disposed || !matchesNingboCallback(cityName)) return
      emit(currentStatus(message = if (hasNewVersion) {
        "Ningbo offline map update is available"
      } else {
        "Ningbo offline map status checked"
      }))
    }

    override fun onRemove(success: Boolean, cityName: String?, message: String?) {
      if (disposed || !matchesNingboCallback(cityName)) return
      if (success) {
        confirmRemoved(CONFIRMATION_ATTEMPTS)
      } else {
        emit(
          payload(
            state = "failed",
            city = resolveNingboCity(),
            progress = 0,
            errorCode = "REMOVE_FAILED",
            message = message?.take(160) ?: "Ningbo offline map deletion failed",
          ),
        )
      }
    }
  }

  fun getStatus(): Map<String, Any> = currentStatus()

  fun download(): Map<String, Any> {
    val offlineManager = requireManager()
    downloadedNingboCity(offlineManager)?.let { downloaded ->
      return payload(
        state = "downloaded",
        city = downloaded,
        progress = 100,
        statusCode = OfflineMapStatus.SUCCESS,
        confirmed = true,
        message = "Ningbo offline map already downloaded",
      ).also(::emit)
    }

    val city = resolveNingboCity(offlineManager)
    if (city == null) {
      pendingDownload = true
      tryPendingDownload(CONFIRMATION_ATTEMPTS)
      return payload(
        state = if (cityListVerified) "failed" else "not-downloaded",
        city = null,
        progress = 0,
        errorCode = if (cityListVerified) "NINGBO_NOT_IN_SDK_CITY_LIST" else null,
        message = if (cityListVerified) {
          "Ningbo was not found in the AMap offline city list"
        } else {
          "Loading the AMap offline city list"
        },
      ).also(::emit)
    }

    return startDownload(offlineManager, city)
  }

  fun delete(): Map<String, Any> {
    pendingDownload = false
    val offlineManager = requireManager()
    val downloaded = downloadedNingboCity(offlineManager)
      ?: return payload(
        state = "not-downloaded",
        city = resolveNingboCity(offlineManager),
        progress = 0,
        confirmed = true,
        message = "Ningbo offline map is not downloaded",
      ).also(::emit)

    offlineManager.remove(downloaded.city)
    return payload(
      state = "downloaded",
      city = downloaded,
      progress = 100,
      confirmed = true,
      message = "Deleting Ningbo offline map",
    ).also(::emit)
  }

  fun destroy() {
    disposed = true
    pendingDownload = false
    handler.removeCallbacksAndMessages(null)
    manager?.destroy()
    manager = null
  }

  private fun requireManager(): OfflineMapManager {
    check(!disposed) { "Ningbo offline map controller has been disposed." }
    manager?.let { return it }

    val created = OfflineMapManager(applicationContext, downloadListener)
    created.setOnOfflineLoadedListener {
      cityListVerified = true
      if (pendingDownload) {
        val city = resolveNingboCity(created)
        if (city == null) {
          pendingDownload = false
          emit(
            payload(
              state = "failed",
              city = null,
              progress = 0,
              errorCode = "NINGBO_NOT_IN_SDK_CITY_LIST",
              message = "Ningbo was not found in the AMap offline city list",
            ),
          )
        } else {
          startDownload(created, city)
        }
      } else {
        emit(currentStatus())
      }
    }
    manager = created
    cityListVerified = created.offlineMapCityList?.isNotEmpty() == true
    return created
  }

  private fun tryPendingDownload(attemptsRemaining: Int) {
    if (!pendingDownload || disposed) return
    val offlineManager = manager ?: return
    val city = resolveNingboCity(offlineManager)
    if (city != null) {
      cityListVerified = true
      startDownload(offlineManager, city)
      return
    }
    if (offlineManager.offlineMapCityList?.isNotEmpty() == true) {
      cityListVerified = true
      pendingDownload = false
      emit(
        payload(
          state = "failed",
          city = null,
          progress = 0,
          errorCode = "NINGBO_NOT_IN_SDK_CITY_LIST",
          message = "Ningbo was not found in the AMap offline city list",
        ),
      )
      return
    }
    if (attemptsRemaining > 0) {
      handler.postDelayed({ tryPendingDownload(attemptsRemaining - 1) }, CONFIRMATION_DELAY_MS)
      return
    }
    pendingDownload = false
    emit(
      payload(
        state = "failed",
        city = null,
        progress = 0,
        errorCode = "AMAP_CITY_LIST_NOT_READY",
        message = "The AMap offline city list did not become ready",
      ),
    )
  }

  private fun startDownload(
    offlineManager: OfflineMapManager,
    city: OfflineMapCity,
  ): Map<String, Any> {
    pendingDownload = false
    offlineManager.downloadByCityName(city.city)
    return payload(
      state = "downloading",
      city = city,
      progress = city.getcompleteCode().coerceIn(0, 100),
      statusCode = city.state,
      message = "Ningbo offline map download started",
    ).also(::emit)
  }

  private fun currentStatus(message: String? = null): Map<String, Any> {
    val offlineManager = requireManager()
    downloadedNingboCity(offlineManager)?.let { city ->
      return payload(
        state = "downloaded",
        city = city,
        progress = 100,
        statusCode = OfflineMapStatus.SUCCESS,
        confirmed = true,
        message = message ?: "Ningbo offline map is downloaded",
      )
    }

    downloadingNingboCity(offlineManager)?.let { city ->
      return payload(
        state = "downloading",
        city = city,
        progress = city.getcompleteCode().coerceIn(0, 100),
        statusCode = city.state,
        message = message ?: "Ningbo offline map download in progress",
      )
    }

    val city = resolveNingboCity(offlineManager)
    return payload(
      state = "not-downloaded",
      city = city,
      progress = 0,
      statusCode = city?.state,
      confirmed = city != null,
      message = message ?: "Ningbo offline map is not downloaded",
    )
  }

  private fun confirmDownloaded(attemptsRemaining: Int) {
    val offlineManager = manager ?: return
    val downloaded = downloadedNingboCity(offlineManager)
    if (downloaded != null) {
      emit(
        payload(
          state = "downloaded",
          city = downloaded,
          progress = 100,
          statusCode = OfflineMapStatus.SUCCESS,
          confirmed = true,
          message = "Ningbo offline map download confirmed by the AMap downloaded city list",
        ),
      )
      return
    }
    if (attemptsRemaining > 0) {
      handler.postDelayed({ confirmDownloaded(attemptsRemaining - 1) }, CONFIRMATION_DELAY_MS)
      return
    }
    emit(
      payload(
        state = "failed",
        city = resolveNingboCity(offlineManager),
        progress = 100,
        statusCode = OfflineMapStatus.SUCCESS,
        errorCode = "DOWNLOAD_NOT_CONFIRMED",
        message = "AMap reported success but Ningbo was absent from the downloaded city list",
      ),
    )
  }

  private fun confirmRemoved(attemptsRemaining: Int) {
    val offlineManager = manager ?: return
    if (downloadedNingboCity(offlineManager) == null) {
      emit(
        payload(
          state = "not-downloaded",
          city = resolveNingboCity(offlineManager),
          progress = 0,
          confirmed = true,
          message = "Ningbo offline map deletion confirmed",
        ),
      )
      return
    }
    if (attemptsRemaining > 0) {
      handler.postDelayed({ confirmRemoved(attemptsRemaining - 1) }, CONFIRMATION_DELAY_MS)
      return
    }
    emit(
      payload(
        state = "failed",
        city = resolveNingboCity(offlineManager),
        progress = 100,
        errorCode = "DELETE_NOT_CONFIRMED",
        message = "AMap reported deletion but Ningbo remained in the downloaded city list",
      ),
    )
  }

  private fun resolveNingboCity(offlineManager: OfflineMapManager? = manager): OfflineMapCity? =
    offlineManager?.offlineMapCityList
      ?.firstOrNull { isNingboOfflineCity(it.city, it.pinyin) }

  private fun downloadedNingboCity(offlineManager: OfflineMapManager): OfflineMapCity? =
    offlineManager.downloadOfflineMapCityList
      ?.firstOrNull { isNingboOfflineCity(it.city, it.pinyin) }

  private fun downloadingNingboCity(offlineManager: OfflineMapManager): OfflineMapCity? =
    offlineManager.downloadingCityList
      ?.firstOrNull { isNingboOfflineCity(it.city, it.pinyin) }

  private fun matchesNingboCallback(value: String?): Boolean {
    if (value.isNullOrBlank()) return false
    if (isNingboOfflineCity(value, value)) return true
    val city = resolveNingboCity() ?: return false
    return listOf(city.city, city.pinyin, city.code, city.adcode)
      .filter { !it.isNullOrBlank() }
      .any { it.equals(value, ignoreCase = true) }
  }

  private fun payload(
    state: String,
    city: OfflineMapCity?,
    progress: Int,
    statusCode: Int? = null,
    errorCode: String? = null,
    confirmed: Boolean = false,
    message: String? = null,
  ): Map<String, Any> {
    val result = linkedMapOf<String, Any>(
      "state" to state,
      "progress" to progress.coerceIn(0, 100),
      "confirmed" to confirmed,
    )
    city?.city?.takeIf { it.isNotBlank() }?.let { result["city"] = it }
    city?.code?.takeIf { it.isNotBlank() }?.let { result["cityCode"] = it }
    city?.adcode?.takeIf { it.isNotBlank() }?.let { result["adCode"] = it }
    city?.size?.takeIf { it > 0L }?.let { result["sizeBytes"] = it }
    statusCode?.let { result["statusCode"] = it }
    errorCode?.let { result["errorCode"] = it }
    message?.let { result["message"] = it.take(160) }
    offlineStoragePath()?.let { result["storagePath"] = it }
    return result
  }

  private fun offlineStoragePath(): String? {
    val mapBaseStorage = runCatching { FileUtil.getMapBaseStorage(applicationContext) }
      .getOrNull()
      ?.takeIf { it.isNotBlank() }
      ?: return null
    return File(mapBaseStorage, "data_v6").absolutePath
  }

  private fun emit(payload: Map<String, Any>) {
    if (disposed) return
    emitToJs(payload)
    Log.i(
      OFFLINE_TAG,
      "state=${payload["state"]} city=${payload["city"] ?: NINGBO_CITY_NAME} " +
        "cityCode=${payload["cityCode"] ?: "unknown"} progress=${payload["progress"]} " +
        "statusCode=${payload["statusCode"] ?: "none"} errorCode=${payload["errorCode"] ?: "none"}",
    )
  }
}
