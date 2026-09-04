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
import android.net.Uri
import android.os.Bundle
import android.os.Debug
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.savedstate.SavedStateRegistryOwner
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.MapsInitializer
import com.amap.api.maps.TextureMapView
import com.amap.api.maps.model.BitmapDescriptor
import com.amap.api.maps.model.BitmapDescriptorFactory
import com.amap.api.maps.model.CameraPosition
import com.amap.api.maps.model.CustomMapStyleOptions
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.Marker
import com.amap.api.maps.model.MarkerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.ceil
import kotlin.math.max

private const val TAG = "MemoraeNativeMap"
private const val MISSING_KEY_SENTINEL = "AMAP_KEY_NOT_CONFIGURED"
private const val SDK_VERSION = "10.1.200"
private const val CUSTOM_MAP_STYLE_ID = "86c653c12a194bd61f7e37008e400725"
private const val SAVED_MAP_BUNDLE = "amap_map_view"
private const val DEFAULT_STATE_KEY = "expo.modules.amapmap.primary"

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
    val label: String?,
  ) : RenderedMarkerTag
  data class CityLabel(val id: String) : RenderedMarkerTag
}

private sealed interface MarkerNode {
  val key: String
  val latitude: Double
  val longitude: Double

  data class Photo(val input: PhotoMarkerInput) : MarkerNode {
    override val key = "photo:${input.id}"
    override val latitude = input.latitude
    override val longitude = input.longitude
  }

  data class Cluster(
    val inputs: List<PhotoMarkerInput>,
    val label: String?,
  ) : MarkerNode {
    val ids = inputs.map { it.id }.sorted()
    override val key = "cluster:${ids.joinToString(",")}"
    override val latitude = inputs.map { it.latitude }.average()
    override val longitude = inputs.map { it.longitude }.average()
  }
}

private data class RenderedNode(
  val marker: Marker,
  var specification: MarkerNode,
)

private data class ClusterConfig(
  val enabled: Boolean = true,
  val gridSizeDp: Double = 88.0,
  val maxZoom: Double = 16.0,
)

private enum class MapLifecycleState {
  NOT_CREATED,
  CREATED,
  RESUMED,
  PAUSED,
  DESTROYED,
}

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
    return mapOf(
      "durationMs" to durationNanos / 1_000_000.0,
      "uiFps" to frames / (durationNanos / 1_000_000_000.0),
      "slowFrames" to slowFrames,
    )
  }

  override fun doFrame(frameTimeNanos: Long) {
    if (!active) return
    if (lastFrameNanos > 0L && frameTimeNanos - lastFrameNanos > 24_000_000L) slowFrames += 1
    lastFrameNanos = frameTimeNanos
    frames += 1
    Choreographer.getInstance().postFrameCallback(this)
  }
}

class ExpoAmapMapView(
  context: Context,
  private val expoAppContext: AppContext,
) : ExpoView(context, expoAppContext) {
  companion object {
    private val nextNativeMapViewInstanceId = AtomicInteger(0)
    private val textureMapViewCreateCount = AtomicInteger(0)
    private val textureMapViewDestroyCount = AtomicInteger(0)
  }

  override val shouldUseAndroidLayout = true

  private val onMapReady by EventDispatcher<Map<String, Any>>()
  private val onMapPress by EventDispatcher<Map<String, Any>>()
  private val onMarkerPress by EventDispatcher<Map<String, Any>>()
  private val onClusterPress by EventDispatcher<Map<String, Any>>()
  private val onCameraIdle by EventDispatcher<Map<String, Any>>()
  private val onNativeError by EventDispatcher<Map<String, Any>>()

  private var mapView: TextureMapView? = null
  private var map: AMap? = null
  private val nativeMapViewInstanceId = nextNativeMapViewInstanceId.incrementAndGet()
  private var lifecycleState = MapLifecycleState.NOT_CREATED
  private var permanentlyDisposed = false
  private var privacyConsentGranted = false
  private var worldMapEnabled = true
  private var hostResumed = false
  private var userGestureActive = false
  private var programmaticCameraMove = false
  private var cameraIsMoving = false
  private var cameraIdleCount = 0
  private var userGestureCameraIdleCount = 0
  private var programmaticCameraIdleCount = 0
  private var initialCamera: NativeMapCamera? = null
  private var initialCameraApplied = false
  private var restoredNativeState = false
  private var statePersistenceKey = DEFAULT_STATE_KEY
  private var savedStateOwner: SavedStateRegistryOwner? = null
  private var savedStateProviderRegistered = false
  private var restoredMapBundle: Bundle? = null
  private val markerUpdateGate = MarkerUpdateGate()
  private var markersById = linkedMapOf<String, PhotoMarkerInput>()
  private var cityLabels: List<CityLabelInput> = emptyList()
  private var clusterConfig = ClusterConfig()
  private val renderedNodes = linkedMapOf<String, RenderedNode>()
  private val renderedCityLabels = mutableListOf<Marker>()
  private val bitmapDescriptors = mutableMapOf<String, BitmapDescriptor>()
  private val bitmapDescriptorBytes = mutableMapOf<String, Int>()
  private val bitmapDescriptorThumbnailKeys = mutableMapOf<String, String>()
  private val bitmapDescriptorThumbnailUris = mutableMapOf<String, String?>()
  private var bitmapBytes = 0L
  private var bitmapDecodeCount = 0
  private var invalidThumbnailCount = 0
  private val frameSampler = UiFrameSampler()
  private var mapCreateStartedAt = 0L
  private var mapViewCreateMs = 0L
  private var amapAvailableMs = 0L
  private var mapReadyMs = 0L
  private var firstVisibleFrameMs = 0L
  private var firstMarkerRenderMs = 0L
  private var initialCameraSetCount = 0
  private var initialCameraMoveCount = 0
  private var requestedCameraMoveCount = 0

  init {
    Log.i(TAG, "perf event=native_map_view_created instance=$nativeMapViewInstanceId")
    layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
  }

  fun setPrivacyConsentGranted(granted: Boolean) {
    if (privacyConsentGranted == granted) return
    privacyConsentGranted = granted
    if (!granted) destroyMap(permanent = false)
  }

  fun setWorldMapEnabled(enabled: Boolean) {
    worldMapEnabled = enabled
    if (privacyConsentGranted && mapView != null) MapsInitializer.loadWorldVectorMap(enabled)
  }

  fun setStatePersistenceKey(key: String?) {
    if (mapView != null) return
    statePersistenceKey = key?.takeIf { it.matches(Regex("[A-Za-z0-9._-]{1,80}")) }
      ?.let { "expo.modules.amapmap.$it" }
      ?: DEFAULT_STATE_KEY
  }

  fun setInitialCamera(rawCamera: Map<String, Any?>?) {
    initialCameraSetCount += 1
    initialCamera = rawCamera?.toNativeCamera()
    applyInitialCameraIfNeeded()
  }

  fun setRequestedCamera(rawCamera: Map<String, Any?>?) {
    val requested = rawCamera?.toNativeCamera() ?: return
    val amap = map ?: return
    if (userGestureActive) return
    val actual = amap.cameraPosition.toNativeCamera()
    if (camerasEquivalent(requested, actual)) return
    programmaticCameraMove = true
    requestedCameraMoveCount += 1
    Log.i(
      TAG,
      "perf event=requested_camera_move instance=$nativeMapViewInstanceId count=$requestedCameraMoveCount",
    )
    val position = amap.cameraPosition
    amap.moveCamera(
      CameraUpdateFactory.newCameraPosition(
        CameraPosition(
          LatLng(requested.latitude, requested.longitude),
          requested.zoom.toFloat(),
          position.tilt,
          position.bearing,
        ),
      ),
    )
  }

  fun setMarkerUpdatesPaused(paused: Boolean) {
    markerUpdateGate.setPaused(paused)?.let(::applyMarkers)
  }

  fun onPropsCommitted() {
    initializeMapIfNeeded()
  }

  private fun initializeMapIfNeeded() {
    if (permanentlyDisposed || !privacyConsentGranted || !isAttachedToWindow || mapView != null) return
    try {
      val applicationInfo = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA,
      )
      val apiKey = applicationInfo.metaData?.getString("com.amap.api.v2.apikey")
      if (apiKey.isNullOrBlank() || apiKey == MISSING_KEY_SENTINEL) {
        emitError("AMAP_KEY_MISSING", "当前构建未配置高德 Android Key。")
        return
      }

      MapsInitializer.updatePrivacyShow(context.applicationContext, true, true)
      MapsInitializer.updatePrivacyAgree(context.applicationContext, true)
      MapsInitializer.loadWorldVectorMap(worldMapEnabled)
      registerSavedStateProvider()

      mapCreateStartedAt = SystemClock.elapsedRealtime()
      val nativeMapView = TextureMapView(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      }
      val textureCreateCount = textureMapViewCreateCount.incrementAndGet()
      Log.i(
        TAG,
        "perf event=texture_map_view_created instance=$nativeMapViewInstanceId total=$textureCreateCount",
      )
      restoredNativeState = restoredMapBundle != null
      nativeMapView.onCreate(restoredMapBundle)
      restoredMapBundle = null
      mapViewCreateMs = elapsedSinceMapCreate()
      Log.i(
        TAG,
        "perf event=texture_map_view_on_create instance=$nativeMapViewInstanceId ms=$mapViewCreateMs",
      )
      addView(nativeMapView)
      mapView = nativeMapView
      lifecycleState = MapLifecycleState.CREATED
      installFirstFrameObserver(nativeMapView)

      map = nativeMapView.map.also(::configureMap)
      amapAvailableMs = elapsedSinceMapCreate()
      Log.i(TAG, "perf event=amap_available instance=$nativeMapViewInstanceId ms=$amapAvailableMs")
      applyInitialCameraIfNeeded()
      applyMarkers(markerUpdateGate.applied)
      syncHostLifecycleFromActivity()
      if (hostResumed) resumeMapIfNeeded()
    } catch (error: Throwable) {
      Log.e(TAG, "map_initialization_failed type=${error.javaClass.simpleName}")
      emitError("AMAP_INITIALIZATION_FAILED", "高德地图初始化失败。")
      destroyMap(permanent = false)
    }
  }

  private fun configureMap(amap: AMap) {
    amap.uiSettings.apply {
      isZoomControlsEnabled = false
      isScaleControlsEnabled = false
      isCompassEnabled = false
      isMyLocationButtonEnabled = false
      isRotateGesturesEnabled = true
      isTiltGesturesEnabled = true
      isScrollGesturesEnabled = true
      isZoomGesturesEnabled = true
    }
    amap.mapType = AMap.MAP_TYPE_NORMAL
    configureOnlineCustomMapStyle(amap)
    amap.showBuildings(false)
    amap.setRoadArrowEnable(false)
    amap.isTrafficEnabled = false
    configureMapListeners(amap)
  }

  private fun configureOnlineCustomMapStyle(amap: AMap) {
    Log.i(TAG, "AMap custom style source = ONLINE styleId=$CUSTOM_MAP_STYLE_ID")
    amap.setCustomMapStyle(
      CustomMapStyleOptions()
        .setStyleId(CUSTOM_MAP_STYLE_ID)
        .setEnable(true),
    )
    Log.i(TAG, "online_custom_style_submitted_to_sdk")
  }

  private fun configureMapListeners(amap: AMap) {
    amap.setOnMapLoadedListener {
      mapReadyMs = elapsedSinceMapCreate()
      Log.i(TAG, "perf event=amap_loaded instance=$nativeMapViewInstanceId ms=$mapReadyMs")
      mapView?.postInvalidateOnAnimation()
      refreshRenderedMarkers()
      onMapReady(
        mapOf(
          "sdkVersion" to SDK_VERSION,
          "worldMapRequested" to worldMapEnabled,
          "architecture" to "ExpoView + TextureMapView",
          "mapViewCreateMs" to mapViewCreateMs,
          "mapReadyMs" to mapReadyMs,
          "firstVisibleFrameMs" to firstVisibleFrameMs,
        ),
      )
    }
    amap.setOnMapClickListener { coordinate -> onMapPress(latLngPayload(coordinate)) }
    amap.setOnMapTouchListener { event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          userGestureActive = true
          programmaticCameraMove = false
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (!cameraIsMoving) userGestureActive = false
        }
      }
    }
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
              "label" to (tag.label ?: ""),
            ),
          )
          val targetZoom = ((amap.cameraPosition?.zoom ?: 3f) + 2.2f).coerceAtMost(19f)
          programmaticCameraMove = true
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
        if (programmaticCameraMove) {
          programmaticCameraIdleCount += 1
        } else if (userGestureActive) {
          userGestureCameraIdleCount += 1
        }
        userGestureActive = false
        programmaticCameraMove = false
        cameraIdleCount += 1
        refreshRenderedMarkers()
        onCameraIdle(cameraIdlePayload(position ?: amap.cameraPosition, frameSampler.stop()))
      }
    })
  }

  private fun applyInitialCameraIfNeeded() {
    val amap = map ?: return
    if (initialCameraApplied || restoredNativeState) return
    val requested = initialCamera ?: NativeMapCamera(31.23540, 121.47475, 14.4)
    initialCameraApplied = true
    programmaticCameraMove = true
    initialCameraMoveCount += 1
    Log.i(
      TAG,
      "perf event=initial_camera_move instance=$nativeMapViewInstanceId count=$initialCameraMoveCount",
    )
    amap.moveCamera(
      CameraUpdateFactory.newCameraPosition(
        CameraPosition(
          LatLng(requested.latitude, requested.longitude),
          requested.zoom.toFloat(),
          28f,
          345f,
        ),
      ),
    )
  }

  fun updateCamera(camera: Map<String, Any?>, animated: Boolean) {
    val requested = camera.toNativeCamera()
    val amap = requireMap()
    if (userGestureActive || camerasEquivalent(requested, amap.cameraPosition.toNativeCamera())) return
    programmaticCameraMove = true
    val position = amap.cameraPosition
    val update = CameraUpdateFactory.newCameraPosition(
      CameraPosition(
        LatLng(requested.latitude, requested.longitude),
        requested.zoom.toFloat(),
        position.tilt,
        position.bearing,
      ),
    )
    if (animated) amap.animateCamera(update) else amap.moveCamera(update)
  }

  fun setMarkers(rawMarkers: List<Map<String, Any?>>) {
    val next = rawMarkers.mapNotNull { raw ->
      try {
        PhotoMarkerInput(
          id = raw.string("id"),
          latitude = raw.double("latitude"),
          longitude = raw.double("longitude"),
          thumbnailKey = raw["thumbnailKey"] as? String,
          thumbnailUri = (raw["thumbnailUri"] as? String)?.takeIf(::safeThumbnailScheme),
          country = raw["country"] as? String,
          province = raw["province"] as? String,
          city = raw["city"] as? String,
          selected = raw["selected"] as? Boolean ?: false,
        ).takeIf { it.latitude in -90.0..90.0 && it.longitude in -180.0..180.0 }
      } catch (_: Throwable) {
        null
      }
    }
    markerUpdateGate.submit(next)?.let(::applyMarkers)
  }

  private fun applyMarkers(next: List<PhotoMarkerInput>) {
    markersById = next.associateByTo(linkedMapOf()) { it.id }
    pruneBitmapCache(next.mapNotNull { it.thumbnailKey }.toSet(), cityLabels.map { it.id }.toSet())
    refreshRenderedMarkers()
  }

  fun setCityLabels(rawLabels: List<Map<String, Any?>>) {
    cityLabels = rawLabels.mapNotNull { raw ->
      try {
        CityLabelInput(
          id = raw.string("id"),
          name = raw.string("name"),
          latitude = raw.double("latitude"),
          longitude = raw.double("longitude"),
          countryCode = raw.string("countryCode"),
          population = raw.numberInt("population"),
          capital = raw["capital"] as? Boolean ?: false,
        )
      } catch (_: Throwable) {
        null
      }
    }
    pruneBitmapCache(markersById.values.mapNotNull { it.thumbnailKey }.toSet(), cityLabels.map { it.id }.toSet())
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
    if (width <= 0 || height <= 0) {
      post { refreshRenderedMarkers() }
      return
    }
    renderCityLabels()
    val desired = desiredMarkerNodes(amap)
    val desiredKeys = desired.keys
    val removeIterator = renderedNodes.iterator()
    while (removeIterator.hasNext()) {
      val entry = removeIterator.next()
      if (entry.key in desiredKeys) continue
      entry.value.marker.remove()
      removeIterator.remove()
    }
    desired.forEach { (key, specification) ->
      val existing = renderedNodes[key]
      if (existing == null || existing.specification::class != specification::class) {
        existing?.marker?.remove()
        renderedNodes[key] = createRenderedNode(specification)
      } else {
        updateRenderedNode(existing, specification)
      }
    }
    if (desired.isNotEmpty() && firstMarkerRenderMs == 0L) {
      firstMarkerRenderMs = elapsedSinceMapCreate()
      Log.i(
        TAG,
        "perf event=first_marker_rendered instance=$nativeMapViewInstanceId ms=$firstMarkerRenderMs rendered_markers=${renderedNodes.size}",
      )
    }
  }

  private fun desiredMarkerNodes(amap: AMap): LinkedHashMap<String, MarkerNode> {
    val inputs = markersById.values.toList()
    if (inputs.isEmpty()) return linkedMapOf()
    val zoom = amap.cameraPosition?.zoom?.toDouble() ?: 3.0
    if (!clusterConfig.enabled || zoom > clusterConfig.maxZoom) {
      return inputs.associateTo(linkedMapOf()) {
        val node = MarkerNode.Photo(it)
        node.key to node
      }
    }
    val gridPixels = max(44.0, clusterConfig.gridSizeDp * resources.displayMetrics.density)
    val groups = linkedMapOf<Pair<Int, Int>, MutableList<PhotoMarkerInput>>()
    inputs.forEach { marker ->
      val point = amap.projection.toScreenLocation(LatLng(marker.latitude, marker.longitude))
      val key = Pair((point.x / gridPixels).toInt(), (point.y / gridPixels).toInt())
      groups.getOrPut(key) { mutableListOf() }.add(marker)
    }
    return groups.values.associateTo(linkedMapOf()) { group ->
      val node: MarkerNode = if (group.size == 1) {
        MarkerNode.Photo(group.first())
      } else {
        MarkerNode.Cluster(group, clusterLabel(group, zoom))
      }
      node.key to node
    }
  }

  private fun createRenderedNode(specification: MarkerNode): RenderedNode {
    val amap = requireMap()
    val marker = when (specification) {
      is MarkerNode.Photo -> amap.addMarker(
        MarkerOptions()
          .position(LatLng(specification.latitude, specification.longitude))
          .anchor(0.5f, 1f)
          .icon(descriptorFor(specification.input)),
      ).also { it.`object` = RenderedMarkerTag.Photo(specification.input.id) }
      is MarkerNode.Cluster -> amap.addMarker(
        MarkerOptions()
          .position(LatLng(specification.latitude, specification.longitude))
          .anchor(0.5f, 0.5f)
          .icon(descriptorForCluster(specification.inputs.size)),
      ).also {
        it.`object` = RenderedMarkerTag.Cluster(
          specification.ids,
          specification.latitude,
          specification.longitude,
          specification.label,
        )
      }
    }
    return RenderedNode(marker, specification)
  }

  private fun updateRenderedNode(rendered: RenderedNode, next: MarkerNode) {
    val previous = rendered.specification
    if (
      kotlin.math.abs(previous.latitude - next.latitude) >= MAP_COORDINATE_EPSILON ||
      kotlin.math.abs(previous.longitude - next.longitude) >= MAP_COORDINATE_EPSILON
    ) rendered.marker.position = LatLng(next.latitude, next.longitude)
    when {
      previous is MarkerNode.Photo && next is MarkerNode.Photo -> {
        if (
          previous.input.thumbnailKey != next.input.thumbnailKey ||
          previous.input.thumbnailUri != next.input.thumbnailUri ||
          previous.input.selected != next.input.selected
        ) rendered.marker.setIcon(descriptorFor(next.input))
        rendered.marker.`object` = RenderedMarkerTag.Photo(next.input.id)
      }
      previous is MarkerNode.Cluster && next is MarkerNode.Cluster -> {
        rendered.marker.`object` = RenderedMarkerTag.Cluster(
          next.ids,
          next.latitude,
          next.longitude,
          next.label,
        )
      }
    }
    rendered.specification = next
  }

  private fun clusterLabel(group: List<PhotoMarkerInput>, zoom: Double): String? {
    fun unique(value: (PhotoMarkerInput) -> String?): String? =
      group.mapNotNull(value).map(String::trim).filter(String::isNotEmpty).distinct().singleOrNull()
    fun short(value: String) = value.replace(
      Regex("(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$"),
      "",
    )
    val country = unique { it.country }
      ?: if (group.any { it.province != null || it.city != null }) "中国" else null
    if (zoom < 6) return unique { it.province }?.let(::short) ?: country
    if (zoom < 9) return unique { it.city }?.let(::short) ?: unique { it.province }?.let(::short) ?: country
    return null
  }

  private fun renderCityLabels() {
    val amap = map ?: return
    renderedCityLabels.forEach { it.remove() }
    renderedCityLabels.clear()
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
      renderedCityLabels += marker
      occupied += rect
    }
  }

  private fun descriptorFor(input: PhotoMarkerInput): BitmapDescriptor {
    val sourceKey = input.thumbnailKey ?: "placeholder"
    val cacheKey = "photo:${sourceKey.hashCode()}:${input.thumbnailUri.hashCode()}:${input.selected}"
    evictStalePhotoDescriptors(sourceKey, input.thumbnailUri)
    return bitmapDescriptors.getOrPut(cacheKey) {
      val source = decodeThumbnail(input.thumbnailUri)
      val markerBitmap = createPhotoMarkerBitmap(source, input.selected)
      source?.recycle()
      bitmapDescriptorThumbnailKeys[cacheKey] = sourceKey
      bitmapDescriptorThumbnailUris[cacheKey] = input.thumbnailUri
      cacheDescriptor(cacheKey, markerBitmap)
    }
  }

  private fun evictStalePhotoDescriptors(sourceKey: String, thumbnailUri: String?) {
    val staleKeys = bitmapDescriptorThumbnailKeys
      .filter { (descriptorKey, ownerKey) ->
        ownerKey == sourceKey && bitmapDescriptorThumbnailUris[descriptorKey] != thumbnailUri
      }
      .keys
    staleKeys.forEach { descriptorKey ->
      bitmapDescriptors.remove(descriptorKey)?.recycle()
      bitmapBytes -= bitmapDescriptorBytes.remove(descriptorKey)?.toLong() ?: 0L
      bitmapDescriptorThumbnailKeys.remove(descriptorKey)
      bitmapDescriptorThumbnailUris.remove(descriptorKey)
    }
  }

  private fun descriptorForCluster(count: Int): BitmapDescriptor {
    val cacheKey = "cluster:$count"
    return bitmapDescriptors.getOrPut(cacheKey) { cacheDescriptor(cacheKey, createClusterBitmap(count)) }
  }

  private fun descriptorForCity(input: CityLabelInput): BitmapDescriptor {
    val cacheKey = "city:${input.id}"
    return bitmapDescriptors.getOrPut(cacheKey) { cacheDescriptor(cacheKey, createCityLabelBitmap(input)) }
  }

  private fun cacheDescriptor(cacheKey: String, bitmap: Bitmap): BitmapDescriptor {
    bitmapBytes += bitmap.allocationByteCount
    bitmapDescriptorBytes[cacheKey] = bitmap.allocationByteCount
    return BitmapDescriptorFactory.fromBitmap(bitmap).also { bitmap.recycle() }
  }

  private fun decodeThumbnail(uriString: String?): Bitmap? {
    if (!safeThumbnailScheme(uriString)) return null
    return try {
      val uri = Uri.parse(uriString)
      val file = File(requireNotNull(uri.path)).canonicalFile
      val cacheRoot = context.cacheDir.canonicalFile
      if (!file.path.startsWith(cacheRoot.path + File.separator) || !file.isFile) {
        invalidThumbnailCount += 1
        Log.w(TAG, "thumbnail_fallback reason=outside_cache")
        return null
      }
      context.contentResolver.openInputStream(uri)?.use { input ->
        bitmapDecodeCount += 1
        BitmapFactory.decodeStream(input)
      } ?: run {
        invalidThumbnailCount += 1
        null
      }
    } catch (_: Throwable) {
      invalidThumbnailCount += 1
      Log.w(TAG, "thumbnail_fallback reason=decode_failed")
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
    canvas.drawCircle(center, center, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = borderWidth
      color = if (selected) Color.rgb(28, 109, 225) else Color.WHITE
    })
    return output
  }

  private fun createClusterBitmap(count: Int): Bitmap {
    val size = dp(56)
    val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val center = size / 2f
    canvas.drawCircle(center, center, center - dp(2), Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(238, 250, 248, 241)
    })
    canvas.drawCircle(center, center, center - dp(3), Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(2).toFloat()
      color = Color.rgb(112, 98, 79)
    })
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(55, 50, 42)
      textSize = dp(16).toFloat()
      textAlign = Paint.Align.CENTER
      isFakeBoldText = true
    }
    canvas.drawText(count.toString(), center, center - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
    return output
  }

  private fun cityLabelTextPaint(input: CityLabelInput): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(55, 50, 42)
    textSize = dp(if (input.capital) 13 else 12).toFloat()
    typeface = Typeface.create(Typeface.DEFAULT, if (input.capital) Typeface.BOLD else Typeface.NORMAL)
    textAlign = Paint.Align.CENTER
    setShadowLayer(dp(1).toFloat(), 0f, dp(1).toFloat(), Color.argb(210, 255, 255, 255))
  }

  private fun createCityLabelBitmap(input: CityLabelInput): Bitmap {
    val textPaint = cityLabelTextPaint(input)
    val width = cityLabelWidth(input)
    val height = cityLabelHeight(input)
    val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    canvas.drawText(input.name, width / 2f, height / 2f - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
    return output
  }

  private fun cityLabelWidth(input: CityLabelInput): Int =
    max(dp(28), ceil(cityLabelTextPaint(input).measureText(input.name).toDouble()).toInt() + dp(8))

  private fun cityLabelHeight(input: CityLabelInput): Int = dp(if (input.capital) 23 else 21)

  private fun pruneBitmapCache(activeThumbnailKeys: Set<String>, activeCityIds: Set<String>) {
    val iterator = bitmapDescriptors.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next()
      val photoSourceKey = bitmapDescriptorThumbnailKeys[entry.key]
      val removePhoto = photoSourceKey != null && photoSourceKey != "placeholder" && photoSourceKey !in activeThumbnailKeys
      val removeCity = entry.key.startsWith("city:") && entry.key.removePrefix("city:") !in activeCityIds
      if (!removePhoto && !removeCity) continue
      entry.value.recycle()
      bitmapBytes -= bitmapDescriptorBytes.remove(entry.key)?.toLong() ?: 0L
      bitmapDescriptorThumbnailKeys.remove(entry.key)
      bitmapDescriptorThumbnailUris.remove(entry.key)
      iterator.remove()
    }
  }

  private fun cameraIdlePayload(position: CameraPosition?, frameMetrics: Map<String, Any>): Map<String, Any> {
    val amap = map ?: return diagnosticsPayload()
    val actual = position ?: amap.cameraPosition
    val bounds = amap.projection.visibleRegion.latLngBounds
    return mapOf(
      "camera" to mapOf(
        "latitude" to actual.target.latitude,
        "longitude" to actual.target.longitude,
        "zoom" to actual.zoom,
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
    "inputMarkerCount" to markersById.size,
    "renderedMarkerCount" to renderedNodes.size,
    "bitmapDecodeCount" to bitmapDecodeCount,
    "bitmapBytes" to bitmapBytes,
    "nativeHeapBytes" to Debug.getNativeHeapAllocatedSize(),
    "runtimeUsedMemoryBytes" to (Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()),
    "cameraIdleCount" to cameraIdleCount,
    "userGestureCameraIdleCount" to userGestureCameraIdleCount,
    "programmaticCameraIdleCount" to programmaticCameraIdleCount,
    "renderedCityLabelCount" to renderedCityLabels.size,
    "invalidThumbnailCount" to invalidThumbnailCount,
    "nativeMapViewInstanceId" to nativeMapViewInstanceId,
    "textureMapViewCreateCount" to textureMapViewCreateCount.get(),
    "textureMapViewDestroyCount" to textureMapViewDestroyCount.get(),
    "mapViewCreateMs" to mapViewCreateMs,
    "amapAvailableMs" to amapAvailableMs,
    "mapReadyMs" to mapReadyMs,
    "firstVisibleFrameMs" to firstVisibleFrameMs,
    "firstMarkerRenderMs" to firstMarkerRenderMs,
    "initialCameraSetCount" to initialCameraSetCount,
    "initialCameraMoveCount" to initialCameraMoveCount,
    "requestedCameraMoveCount" to requestedCameraMoveCount,
  )

  private fun installFirstFrameObserver(nativeMapView: TextureMapView) {
    val observer = object : ViewTreeObserver.OnDrawListener {
      override fun onDraw() {
        if (mapReadyMs > 0L && firstVisibleFrameMs == 0L) {
          firstVisibleFrameMs = elapsedSinceMapCreate()
          Log.i(
            TAG,
            "perf event=first_visible_frame instance=$nativeMapViewInstanceId ms=$firstVisibleFrameMs rendered_markers=${renderedNodes.size}",
          )
        }
        if (firstVisibleFrameMs > 0L && nativeMapView.viewTreeObserver.isAlive) {
          nativeMapView.post { nativeMapView.viewTreeObserver.removeOnDrawListener(this) }
        }
      }
    }
    nativeMapView.viewTreeObserver.addOnDrawListener(observer)
  }

  private fun registerSavedStateProvider() {
    if (savedStateProviderRegistered) return
    val owner = expoAppContext.currentActivity as? SavedStateRegistryOwner ?: return
    try {
      restoredMapBundle = owner.savedStateRegistry
        .consumeRestoredStateForKey(statePersistenceKey)
        ?.getBundle(SAVED_MAP_BUNDLE)
      owner.savedStateRegistry.registerSavedStateProvider(statePersistenceKey) {
        Bundle().apply {
          val mapState = Bundle()
          mapView?.onSaveInstanceState(mapState)
          putBundle(SAVED_MAP_BUNDLE, mapState)
        }
      }
      savedStateOwner = owner
      savedStateProviderRegistered = true
    } catch (error: Throwable) {
      emitError("AMAP_SAVED_STATE_UNAVAILABLE", error.javaClass.simpleName)
    }
  }

  private fun unregisterSavedStateProvider() {
    if (!savedStateProviderRegistered) return
    try {
      savedStateOwner?.savedStateRegistry?.unregisterSavedStateProvider(statePersistenceKey)
    } catch (_: Throwable) {
      // Activity teardown can outlive the registry; no sensitive payload is logged.
    }
    savedStateOwner = null
    savedStateProviderRegistered = false
  }

  private fun syncHostLifecycleFromActivity() {
    val owner = expoAppContext.currentActivity as? LifecycleOwner
    hostResumed = owner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true
  }

  fun onHostResume() {
    hostResumed = true
    Log.i(
      TAG,
      "perf event=host_resume instance=$nativeMapViewInstanceId creates=${textureMapViewCreateCount.get()} destroys=${textureMapViewDestroyCount.get()}",
    )
    resumeMapIfNeeded()
  }

  private fun resumeMapIfNeeded() {
    if (lifecycleState != MapLifecycleState.CREATED && lifecycleState != MapLifecycleState.PAUSED) return
    mapView?.onResume()
    lifecycleState = MapLifecycleState.RESUMED
  }

  fun onHostPause() {
    hostResumed = false
    Log.i(
      TAG,
      "perf event=host_pause instance=$nativeMapViewInstanceId creates=${textureMapViewCreateCount.get()} destroys=${textureMapViewDestroyCount.get()}",
    )
    if (lifecycleState != MapLifecycleState.RESUMED) return
    mapView?.onPause()
    lifecycleState = MapLifecycleState.PAUSED
  }

  fun onHostDestroy() {
    destroyMap(permanent = true)
  }

  fun dispose() {
    destroyMap(permanent = true)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    initializeMapIfNeeded()
  }

  override fun onDetachedFromWindow() {
    // Fabric can detach a live view during overlays/navigation. Detach is not lifecycle authority.
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    if (width > 0 && height > 0 && (width != oldWidth || height != oldHeight)) post { refreshRenderedMarkers() }
  }

  private fun destroyMap(permanent: Boolean) {
    if (permanent) permanentlyDisposed = true
    if (lifecycleState == MapLifecycleState.RESUMED) mapView?.onPause()
    frameSampler.stop()
    cameraIsMoving = false
    userGestureActive = false
    programmaticCameraMove = false
    renderedNodes.values.forEach { it.marker.remove() }
    renderedNodes.clear()
    renderedCityLabels.forEach { it.remove() }
    renderedCityLabels.clear()
    bitmapDescriptors.values.forEach { it.recycle() }
    bitmapDescriptors.clear()
    bitmapDescriptorBytes.clear()
    bitmapDescriptorThumbnailKeys.clear()
    bitmapDescriptorThumbnailUris.clear()
    bitmapBytes = 0L
    map?.setOnMapLoadedListener(null)
    map?.setOnMapClickListener(null)
    map?.setOnMarkerClickListener(null)
    map?.setOnCameraChangeListener(null)
    map?.setOnMapTouchListener(null)
    map?.clear()
    map = null
    mapView?.let { nativeMapView ->
      nativeMapView.onDestroy()
      val textureDestroyCount = textureMapViewDestroyCount.incrementAndGet()
      Log.i(
        TAG,
        "perf event=texture_map_view_destroyed instance=$nativeMapViewInstanceId total=$textureDestroyCount permanent=$permanent",
      )
      removeView(nativeMapView)
    }
    mapView = null
    unregisterSavedStateProvider()
    lifecycleState = if (permanent) MapLifecycleState.DESTROYED else MapLifecycleState.NOT_CREATED
    initialCameraApplied = false
    restoredNativeState = false
    restoredMapBundle = null
    if (permanent) {
      markerUpdateGate.clear()
      markersById.clear()
      cityLabels = emptyList()
    }
  }

  private fun elapsedSinceMapCreate(): Long =
    if (mapCreateStartedAt == 0L) 0L else SystemClock.elapsedRealtime() - mapCreateStartedAt

  private fun latLngPayload(coordinate: LatLng): Map<String, Any> = mapOf(
    "latitude" to coordinate.latitude,
    "longitude" to coordinate.longitude,
  )

  private fun requireMap(): AMap = map ?: error("高德地图尚未初始化。")

  private fun emitError(code: String, message: String) {
    onNativeError(mapOf("code" to code, "message" to message.take(160)))
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}

private fun CameraPosition.toNativeCamera(): NativeMapCamera = NativeMapCamera(
  latitude = target.latitude,
  longitude = target.longitude,
  zoom = zoom.toDouble(),
)

private fun Map<String, Any?>.toNativeCamera(): NativeMapCamera = NativeMapCamera(
  latitude = double("latitude"),
  longitude = double("longitude"),
  zoom = optionalDouble("zoom") ?: 4.0,
)

private fun Map<String, Any?>.string(key: String): String =
  this[key] as? String ?: error("缺少字符串字段：$key")

private fun Map<String, Any?>.double(key: String): Double =
  (this[key] as? Number)?.toDouble() ?: error("缺少数字字段：$key")

private fun Map<String, Any?>.numberInt(key: String): Int =
  (this[key] as? Number)?.toInt() ?: error("缺少整数字段：$key")

private fun Map<String, Any?>.optionalDouble(key: String): Double? =
  (this[key] as? Number)?.toDouble()
