package expo.modules.amapmap

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Debug
import android.util.Base64
import android.view.Choreographer
import android.view.ViewGroup
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.MapView
import com.amap.api.maps.MapsInitializer
import com.amap.api.maps.model.BitmapDescriptor
import com.amap.api.maps.model.BitmapDescriptorFactory
import com.amap.api.maps.model.CameraPosition
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.Marker
import com.amap.api.maps.model.MarkerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.ceil

private const val MISSING_KEY_SENTINEL = "AMAP_KEY_NOT_CONFIGURED"

private data class PhotoMarkerInput(
  val id: String,
  val latitude: Double,
  val longitude: Double,
  val title: String?,
  val thumbnailKey: String?,
  val thumbnailDataUri: String?,
  val selected: Boolean,
)

private data class CityLabelInput(
  val id: String,
  val name: String,
  val latitude: Double,
  val longitude: Double,
  val countryCode: String,
  val population: Int,
  val capital: Boolean,
)

private sealed interface RenderedMarkerTag {
  data class Photo(val id: String) : RenderedMarkerTag
  data class Cluster(
    val ids: List<String>,
    val latitude: Double,
    val longitude: Double,
  ) : RenderedMarkerTag

  data class CityLabel(val id: String) : RenderedMarkerTag
}

private data class ClusterConfig(
  val enabled: Boolean = true,
  val gridSizeDp: Double = 88.0,
  val maxZoom: Double = 16.0,
)

private class UiFrameSampler : Choreographer.FrameCallback {
  private var active = false
  private var startedAtNanos = 0L
  private var lastFrameNanos = 0L
  private var frames = 0
  private var slowFrames = 0

  fun start() {
    if (active) return
    active = true
    startedAtNanos = System.nanoTime()
    lastFrameNanos = 0L
    frames = 0
    slowFrames = 0
    Choreographer.getInstance().postFrameCallback(this)
  }

  fun stop(): Map<String, Any> {
    if (!active) return mapOf("durationMs" to 0.0, "uiFps" to 0.0, "slowFrames" to 0)
    active = false
    Choreographer.getInstance().removeFrameCallback(this)
    val durationNanos = max(1L, System.nanoTime() - startedAtNanos)
    val durationSeconds = durationNanos / 1_000_000_000.0
    return mapOf(
      "durationMs" to durationNanos / 1_000_000.0,
      "uiFps" to frames / durationSeconds,
      "slowFrames" to slowFrames,
    )
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (!active) return
    if (lastFrameNanos > 0L && frameTimeNanos - lastFrameNanos > 24_000_000L) {
      slowFrames += 1
    }
    lastFrameNanos = frameTimeNanos
    frames += 1
    Choreographer.getInstance().postFrameCallback(this)
  }
}

class ExpoAmapMapView(context: Context, expoAppContext: AppContext) :
  ExpoView(context, expoAppContext) {
  override val shouldUseAndroidLayout = true

  private val onMapReady by EventDispatcher<Map<String, Any>>()
  private val onMapPress by EventDispatcher<Map<String, Any>>()
  private val onMarkerPress by EventDispatcher<Map<String, Any>>()
  private val onClusterPress by EventDispatcher<Map<String, Any>>()
  private val onCameraIdle by EventDispatcher<Map<String, Any>>()
  private val onNativeError by EventDispatcher<Map<String, Any>>()

  private var mapView: MapView? = null
  private var map: AMap? = null
  private var privacyConsentGranted = false
  private var worldMapEnabled = true
  private var disposed = false
  private var cameraIsMoving = false
  private var cameraIdleCount = 0
  private var markers: List<PhotoMarkerInput> = emptyList()
  private var cityLabels: List<CityLabelInput> = emptyList()
  private var clusterConfig = ClusterConfig()
  private val renderedMarkers = mutableListOf<Marker>()
  private val renderedCityLabels = mutableListOf<Marker>()
  private val bitmapDescriptors = mutableMapOf<String, BitmapDescriptor>()
  private val bitmapDescriptorBytes = mutableMapOf<String, Int>()
  private var bitmapBytes = 0L
  private var bitmapDecodeCount = 0
  private val frameSampler = UiFrameSampler()

  init {
    layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
  }

  fun setPrivacyConsentGranted(granted: Boolean) {
    privacyConsentGranted = granted
    if (granted) initializeMapIfNeeded() else disposeMap()
  }

  fun setWorldMapEnabled(enabled: Boolean) {
    worldMapEnabled = enabled
    if (privacyConsentGranted) MapsInitializer.loadWorldVectorMap(enabled)
  }

  private fun initializeMapIfNeeded() {
    if (!privacyConsentGranted || mapView != null) return
    disposed = false
    try {
      val applicationInfo = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA,
      )
      val apiKey = applicationInfo.metaData?.getString("com.amap.api.v2.apikey")
      if (apiKey.isNullOrBlank() || apiKey == MISSING_KEY_SENTINEL) {
        emitError("AMAP_KEY_MISSING", "构建时未设置 MEMORY_RECALL_AMAP_ANDROID_KEY。")
        return
      }

      MapsInitializer.updatePrivacyShow(context.applicationContext, true, true)
      MapsInitializer.updatePrivacyAgree(context.applicationContext, true)
      MapsInitializer.loadWorldVectorMap(worldMapEnabled)

      val nativeMapView = MapView(context)
      nativeMapView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      nativeMapView.onCreate(null)
      addView(nativeMapView)
      mapView = nativeMapView
      map = nativeMapView.map.also { amap ->
        amap.uiSettings.isZoomControlsEnabled = false
        amap.uiSettings.isCompassEnabled = false
        amap.uiSettings.isScaleControlsEnabled = false
        configureMapListeners(amap)
        amap.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(32.0, 115.0), 3.2f))
      }
      if (isAttachedToWindow) nativeMapView.onResume()
    } catch (error: Throwable) {
      emitError("AMAP_INITIALIZATION_FAILED", error.message ?: error.javaClass.simpleName)
      disposeMap()
    }
  }

  private fun configureMapListeners(amap: AMap) {
    amap.setOnMapLoadedListener {
      refreshRenderedMarkers()
      onMapReady(
        mapOf(
          "sdkVersion" to "10.1.200",
          "worldMapRequested" to worldMapEnabled,
          "architecture" to "Expo Modules Native View",
        ),
      )
    }
    amap.setOnMapClickListener { coordinate -> onMapPress(latLngPayload(coordinate)) }
    amap.setOnMarkerClickListener { marker ->
      when (val tag = marker.`object`) {
        is RenderedMarkerTag.Photo -> {
          onMarkerPress(mapOf("id" to tag.id))
          true
        }
        is RenderedMarkerTag.Cluster -> {
          onClusterPress(
            mapOf(
              "ids" to tag.ids,
              "count" to tag.ids.size,
              "latitude" to tag.latitude,
              "longitude" to tag.longitude,
            ),
          )
          val targetZoom = ((amap.cameraPosition?.zoom ?: 3f) + 2.2f).coerceAtMost(19f)
          amap.animateCamera(
            CameraUpdateFactory.newLatLngZoom(LatLng(tag.latitude, tag.longitude), targetZoom),
          )
          true
        }
        is RenderedMarkerTag.CityLabel -> false
        else -> false
      }
    }
    amap.setOnCameraChangeListener(object : AMap.OnCameraChangeListener {
      override fun onCameraChange(position: CameraPosition?) {
        if (!cameraIsMoving) {
          cameraIsMoving = true
          frameSampler.start()
        }
      }

      override fun onCameraChangeFinish(position: CameraPosition?) {
        cameraIsMoving = false
        cameraIdleCount += 1
        refreshRenderedMarkers()
        onCameraIdle(cameraIdlePayload(position ?: amap.cameraPosition, frameSampler.stop()))
      }
    })
  }

  fun updateCamera(camera: Map<String, Any?>, animated: Boolean) {
    val amap = requireMap()
    val latitude = camera.double("latitude")
    val longitude = camera.double("longitude")
    val zoom = camera.optionalDouble("zoom")?.toFloat() ?: amap.cameraPosition.zoom
    val update = CameraUpdateFactory.newLatLngZoom(LatLng(latitude, longitude), zoom)
    if (animated) amap.animateCamera(update) else amap.moveCamera(update)
  }

  fun setMarkers(rawMarkers: List<Map<String, Any?>>) {
    markers = rawMarkers.map { raw ->
      PhotoMarkerInput(
        id = raw.string("id"),
        latitude = raw.double("latitude"),
        longitude = raw.double("longitude"),
        title = raw["title"] as? String,
        thumbnailKey = raw["thumbnailKey"] as? String,
        thumbnailDataUri = raw["thumbnailDataUri"] as? String,
        selected = raw["selected"] as? Boolean ?: false,
      )
    }
    pruneBitmapCache(
      markers.mapNotNull { it.thumbnailKey }.toSet(),
      cityLabels.map { it.id }.toSet(),
    )
    refreshRenderedMarkers()
  }

  fun setCityLabels(rawLabels: List<Map<String, Any?>>) {
    cityLabels = rawLabels.map { raw ->
      CityLabelInput(
        id = raw.string("id"),
        name = raw.string("name"),
        latitude = raw.double("latitude"),
        longitude = raw.double("longitude"),
        countryCode = raw.string("countryCode"),
        population = raw.numberInt("population"),
        capital = raw["capital"] as? Boolean ?: false,
      )
    }
    pruneBitmapCache(
      markers.mapNotNull { it.thumbnailKey }.toSet(),
      cityLabels.map { it.id }.toSet(),
    )
    refreshRenderedMarkers()
  }

  fun setClusterConfig(rawConfig: Map<String, Any?>) {
    clusterConfig = ClusterConfig(
      enabled = rawConfig["enabled"] as? Boolean ?: true,
      gridSizeDp = rawConfig.optionalDouble("gridSizeDp") ?: 88.0,
      maxZoom = rawConfig.optionalDouble("maxZoom") ?: 16.0,
    )
    refreshRenderedMarkers()
  }

  fun latLngToScreen(rawCoordinate: Map<String, Any?>): Map<String, Any> {
    val point = requireMap().projection.toScreenLocation(
      LatLng(rawCoordinate.double("latitude"), rawCoordinate.double("longitude")),
    )
    return mapOf("x" to point.x, "y" to point.y)
  }

  fun screenToLatLng(rawPoint: Map<String, Any?>): Map<String, Any> {
    val coordinate = requireMap().projection.fromScreenLocation(
      Point(rawPoint.double("x").toInt(), rawPoint.double("y").toInt()),
    )
    return latLngPayload(coordinate)
  }

  fun getDiagnostics(): Map<String, Any> = diagnosticsPayload()

  private fun refreshRenderedMarkers() {
    val amap = map ?: return
    renderedMarkers.forEach { it.remove() }
    renderedMarkers.clear()
    renderedCityLabels.forEach { it.remove() }
    renderedCityLabels.clear()
    if (width <= 0 || height <= 0) return

    renderCityLabels()
    if (markers.isEmpty()) return

    val zoom = amap.cameraPosition?.zoom?.toDouble() ?: 3.0
    if (!clusterConfig.enabled || zoom > clusterConfig.maxZoom) {
      markers.forEach(::renderPhotoMarker)
      return
    }

    val gridPixels = max(44.0, clusterConfig.gridSizeDp * resources.displayMetrics.density)
    val groups = linkedMapOf<Pair<Int, Int>, MutableList<PhotoMarkerInput>>()
    markers.forEach { marker ->
      val point = amap.projection.toScreenLocation(LatLng(marker.latitude, marker.longitude))
      val key = Pair((point.x / gridPixels).toInt(), (point.y / gridPixels).toInt())
      groups.getOrPut(key) { mutableListOf() }.add(marker)
    }

    groups.values.forEach { group ->
      if (group.size == 1) renderPhotoMarker(group.first()) else renderCluster(group)
    }
  }

  private fun renderCityLabels() {
    val amap = map ?: return
    if (cityLabels.isEmpty()) return
    val occupied = mutableListOf<RectF>()
    val sortedLabels = cityLabels.sortedWith(
      compareByDescending<CityLabelInput> { it.capital }
        .thenByDescending { it.population }
        .thenBy { it.id },
    )
    for (input in sortedLabels) {
      if (renderedCityLabels.size >= 120) break
      val point = amap.projection.toScreenLocation(LatLng(input.latitude, input.longitude))
      val labelWidth = cityLabelWidth(input).toFloat()
      val labelHeight = cityLabelHeight(input).toFloat()
      val rect = RectF(
        point.x - labelWidth / 2f,
        point.y - labelHeight / 2f,
        point.x + labelWidth / 2f,
        point.y + labelHeight / 2f,
      )
      if (rect.right < 0f || rect.left > width || rect.bottom < 0f || rect.top > height) continue
      if (occupied.any { RectF.intersects(it, rect) }) continue
      val marker = amap.addMarker(
        MarkerOptions()
          .position(LatLng(input.latitude, input.longitude))
          .anchor(0.5f, 0.5f)
          .icon(descriptorForCity(input))
          .zIndex(-10f),
      )
      marker.`object` = RenderedMarkerTag.CityLabel(input.id)
      marker.setClickable(false)
      marker.setInfoWindowEnable(false)
      renderedCityLabels.add(marker)
      occupied.add(rect)
    }
  }

  private fun renderPhotoMarker(input: PhotoMarkerInput) {
    val amap = map ?: return
    val marker = amap.addMarker(
      MarkerOptions()
        .position(LatLng(input.latitude, input.longitude))
        .anchor(0.5f, 1.0f)
        .icon(descriptorFor(input))
        .title(input.title),
    )
    marker.`object` = RenderedMarkerTag.Photo(input.id)
    renderedMarkers.add(marker)
  }

  private fun renderCluster(group: List<PhotoMarkerInput>) {
    val amap = map ?: return
    val latitude = group.map { it.latitude }.average()
    val longitude = group.map { it.longitude }.average()
    val count = group.size
    val cacheKey = "cluster:$count"
    val descriptor = bitmapDescriptors.getOrPut(cacheKey) {
      val bitmap = createClusterBitmap(count)
      bitmapBytes += bitmap.allocationByteCount
      bitmapDescriptorBytes[cacheKey] = bitmap.allocationByteCount
      BitmapDescriptorFactory.fromBitmap(bitmap).also { bitmap.recycle() }
    }
    val marker = amap.addMarker(
      MarkerOptions()
        .position(LatLng(latitude, longitude))
        .anchor(0.5f, 0.5f)
        .icon(descriptor),
    )
    marker.`object` = RenderedMarkerTag.Cluster(group.map { it.id }, latitude, longitude)
    renderedMarkers.add(marker)
  }

  private fun descriptorFor(input: PhotoMarkerInput): BitmapDescriptor {
    val sourceKey = input.thumbnailKey ?: "placeholder"
    val cacheKey = "photo:$sourceKey:${input.selected}"
    return bitmapDescriptors.getOrPut(cacheKey) {
      val source = decodeThumbnail(input.thumbnailDataUri)
      val markerBitmap = createPhotoMarkerBitmap(source, input.selected)
      source?.recycle()
      bitmapBytes += markerBitmap.allocationByteCount
      bitmapDescriptorBytes[cacheKey] = markerBitmap.allocationByteCount
      BitmapDescriptorFactory.fromBitmap(markerBitmap).also { markerBitmap.recycle() }
    }
  }

  private fun descriptorForCity(input: CityLabelInput): BitmapDescriptor {
    val cacheKey = "city:${input.id}"
    return bitmapDescriptors.getOrPut(cacheKey) {
      val bitmap = createCityLabelBitmap(input)
      bitmapBytes += bitmap.allocationByteCount
      bitmapDescriptorBytes[cacheKey] = bitmap.allocationByteCount
      BitmapDescriptorFactory.fromBitmap(bitmap).also { bitmap.recycle() }
    }
  }

  private fun decodeThumbnail(dataUri: String?): Bitmap? {
    if (dataUri.isNullOrBlank()) return null
    return try {
      val encoded = dataUri.substringAfter(',', missingDelimiterValue = "")
      if (encoded.isBlank()) return null
      val bytes = Base64.decode(encoded, Base64.DEFAULT)
      bitmapDecodeCount += 1
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Throwable) {
      null
    }
  }

  private fun createPhotoMarkerBitmap(source: Bitmap?, selected: Boolean): Bitmap {
    val size = dp(if (selected) 64 else 54)
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val center = size / 2f
    val borderWidth = dp(if (selected) 4 else 3).toFloat()
    val radius = center - borderWidth
    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    if (source == null) {
      fillPaint.color = Color.rgb(132, 111, 88)
    } else {
      val shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
      val scale = max(size.toFloat() / source.width, size.toFloat() / source.height)
      val matrix = Matrix().apply {
        setScale(scale, scale)
        postTranslate((size - source.width * scale) / 2f, (size - source.height * scale) / 2f)
      }
      shader.setLocalMatrix(matrix)
      fillPaint.shader = shader
    }
    canvas.drawCircle(center, center, radius, fillPaint)
    canvas.drawCircle(
      center,
      center,
      radius,
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = borderWidth
        color = if (selected) Color.rgb(28, 109, 225) else Color.WHITE
      },
    )
    return output
  }

  private fun createClusterBitmap(count: Int): Bitmap {
    val size = dp(56)
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val center = size / 2f
    canvas.drawCircle(
      center,
      center,
      center - dp(2),
      Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(238, 250, 248, 241) },
    )
    canvas.drawCircle(
      center,
      center,
      center - dp(3),
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(2).toFloat()
        color = Color.rgb(112, 98, 79)
      },
    )
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(55, 50, 42)
      textSize = dp(16).toFloat()
      textAlign = Paint.Align.CENTER
      isFakeBoldText = true
    }
    val baseline = center - (textPaint.ascent() + textPaint.descent()) / 2f
    canvas.drawText(count.toString(), center, baseline, textPaint)
    return output
  }

  private fun cityLabelTextPaint(input: CityLabelInput): Paint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(55, 50, 42)
      textSize = dp(if (input.capital) 13 else 12).toFloat()
      typeface = Typeface.create(
        Typeface.DEFAULT,
        if (input.capital) Typeface.BOLD else Typeface.NORMAL,
      )
      textAlign = Paint.Align.CENTER
      setShadowLayer(dp(1).toFloat(), 0f, dp(1).toFloat(), Color.argb(210, 255, 255, 255))
    }

  private fun createCityLabelBitmap(input: CityLabelInput): Bitmap {
    val textPaint = cityLabelTextPaint(input)
    val width = cityLabelWidth(input)
    val height = cityLabelHeight(input)
    val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val baseline = height / 2f - (textPaint.ascent() + textPaint.descent()) / 2f
    canvas.drawText(input.name, width / 2f, baseline, textPaint)
    return output
  }

  private fun cityLabelWidth(input: CityLabelInput): Int =
    max(dp(28), ceil(cityLabelTextPaint(input).measureText(input.name).toDouble()).toInt() + dp(8))

  private fun cityLabelHeight(input: CityLabelInput): Int = dp(if (input.capital) 23 else 21)

  private fun pruneBitmapCache(
    activeThumbnailKeys: Set<String>,
    activeCityIds: Set<String> = emptySet(),
  ) {
    val iterator = bitmapDescriptors.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next()
      val sourceKey = entry.key.removePrefix("photo:").substringBeforeLast(':')
      if (
        entry.key.startsWith("photo:") &&
        sourceKey != "placeholder" &&
        sourceKey !in activeThumbnailKeys
      ) {
        entry.value.recycle()
        bitmapBytes -= bitmapDescriptorBytes.remove(entry.key)?.toLong() ?: 0L
        iterator.remove()
      }
      if (entry.key.startsWith("city:") && entry.key.removePrefix("city:") !in activeCityIds) {
        entry.value.recycle()
        bitmapBytes -= bitmapDescriptorBytes.remove(entry.key)?.toLong() ?: 0L
        iterator.remove()
      }
    }
  }

  private fun cameraIdlePayload(
    position: CameraPosition?,
    frameMetrics: Map<String, Any>,
  ): Map<String, Any> {
    val amap = map ?: return diagnosticsPayload()
    val target = position?.target ?: amap.cameraPosition.target
    val bounds = amap.projection.visibleRegion.latLngBounds
    return mapOf(
      "camera" to mapOf(
        "latitude" to target.latitude,
        "longitude" to target.longitude,
        "zoom" to (position?.zoom ?: amap.cameraPosition.zoom),
      ),
      "bounds" to mapOf(
        "northEast" to latLngPayload(bounds.northeast),
        "southWest" to latLngPayload(bounds.southwest),
      ),
      "frameMetrics" to frameMetrics,
      "diagnostics" to diagnosticsPayload(),
    )
  }

  private fun diagnosticsPayload(): Map<String, Any> = mapOf(
    "inputMarkerCount" to markers.size,
    "renderedMarkerCount" to renderedMarkers.size,
    "bitmapDecodeCount" to bitmapDecodeCount,
    "bitmapBytes" to bitmapBytes,
    "nativeHeapBytes" to Debug.getNativeHeapAllocatedSize(),
    "runtimeUsedMemoryBytes" to (
      Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()
    ),
    "cameraIdleCount" to cameraIdleCount,
    "renderedCityLabelCount" to renderedCityLabels.size,
  )

  private fun latLngPayload(coordinate: LatLng): Map<String, Any> = mapOf(
    "latitude" to coordinate.latitude,
    "longitude" to coordinate.longitude,
  )

  private fun requireMap(): AMap = map ?: error("高德地图尚未初始化。")

  private fun emitError(code: String, message: String) {
    onNativeError(mapOf("code" to code, "message" to message))
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  fun onActivityForeground() {
    mapView?.onResume()
  }

  fun onActivityBackground() {
    mapView?.onPause()
  }

  fun dispose() {
    disposeMap()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (privacyConsentGranted) initializeMapIfNeeded()
    mapView?.onResume()
  }

  override fun onDetachedFromWindow() {
    mapView?.onPause()
    disposeMap()
    super.onDetachedFromWindow()
  }

  private fun disposeMap() {
    if (disposed && mapView == null) return
    disposed = true
    frameSampler.stop()
    cameraIsMoving = false
    renderedMarkers.forEach { it.remove() }
    renderedMarkers.clear()
    renderedCityLabels.forEach { it.remove() }
    renderedCityLabels.clear()
    bitmapDescriptors.values.forEach { it.recycle() }
    bitmapDescriptors.clear()
    bitmapDescriptorBytes.clear()
    bitmapBytes = 0L
    map?.clear()
    map = null
    mapView?.onPause()
    mapView?.onDestroy()
    mapView?.let { removeView(it) }
    mapView = null
  }
}

private fun Map<String, Any?>.string(key: String): String =
  this[key] as? String ?: error("缺少字符串字段：$key")

private fun Map<String, Any?>.double(key: String): Double =
  (this[key] as? Number)?.toDouble() ?: error("缺少数字字段：$key")

private fun Map<String, Any?>.numberInt(key: String): Int =
  (this[key] as? Number)?.toInt() ?: error("缺少整数字段：$key")

private fun Map<String, Any?>.optionalDouble(key: String): Double? =
  (this[key] as? Number)?.toDouble()
