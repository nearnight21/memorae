package expo.modules.amapmap

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Collections
import java.util.WeakHashMap

class ExpoAmapMapModule : Module() {
  private val activeViews = Collections.newSetFromMap(
    WeakHashMap<ExpoAmapMapView, Boolean>(),
  )

  override fun definition() = ModuleDefinition {
    Name("ExpoAmapMap")

    OnActivityEntersForeground {
      activeViews.toList().forEach { it.onHostResume() }
    }

    OnActivityEntersBackground {
      activeViews.toList().forEach { it.onHostPause() }
    }

    OnActivityDestroys {
      destroyActiveViews()
    }

    OnDestroy {
      disposeActiveViews()
    }

    View(ExpoAmapMapView::class) {
      Events(
        "onMapReady",
        "onMapPress",
        "onMarkerPress",
        "onClusterPress",
        "onCameraIdle",
        "onNativeError",
        "onOfflineMapStatus"
      )

      OnViewDidUpdateProps { view ->
        activeViews.add(view)
        view.onPropsCommitted()
      }

      OnViewDestroys { view ->
        activeViews.remove(view)
        view.dispose()
      }

      Prop("privacyConsentGranted") { view: ExpoAmapMapView, granted: Boolean ->
        view.setPrivacyConsentGranted(granted)
      }

      Prop("worldMapEnabled") { view: ExpoAmapMapView, enabled: Boolean ->
        view.setWorldMapEnabled(enabled)
      }

      Prop("statePersistenceKey") { view: ExpoAmapMapView, key: String? ->
        view.setStatePersistenceKey(key)
      }

      Prop("initialCamera") { view: ExpoAmapMapView, camera: Map<String, Any?>? ->
        view.setInitialCamera(camera)
      }

      Prop("camera") { view: ExpoAmapMapView, camera: Map<String, Any?>? ->
        view.setRequestedCamera(camera)
      }

      Prop("markers") { view: ExpoAmapMapView, markers: List<Map<String, Any?>>? ->
        view.setMarkers(markers ?: emptyList())
      }

      Prop("markerUpdatesPaused") { view: ExpoAmapMapView, paused: Boolean ->
        view.setMarkerUpdatesPaused(paused)
      }

      AsyncFunction("moveCamera") {
        view: ExpoAmapMapView, camera: Map<String, Any?> ->
        view.updateCamera(camera, animated = false)
      }

      AsyncFunction("animateCamera") {
        view: ExpoAmapMapView, camera: Map<String, Any?> ->
        view.updateCamera(camera, animated = true)
      }

      AsyncFunction("setMarkers") {
        view: ExpoAmapMapView, markers: List<Map<String, Any?>> ->
        view.setMarkers(markers)
      }

      AsyncFunction("setMarkerUpdatesPaused") {
        view: ExpoAmapMapView, paused: Boolean ->
        view.setMarkerUpdatesPaused(paused)
      }

      AsyncFunction("setCityLabels") {
        view: ExpoAmapMapView, labels: List<Map<String, Any?>> ->
        view.setCityLabels(labels)
      }

      AsyncFunction("setClusters") {
        view: ExpoAmapMapView, config: Map<String, Any?> ->
        view.setClusterConfig(config)
      }

      AsyncFunction("latLngToScreen") {
        view: ExpoAmapMapView, coordinate: Map<String, Any?> ->
        view.latLngToScreen(coordinate)
      }

      AsyncFunction("screenToLatLng") {
        view: ExpoAmapMapView, point: Map<String, Any?> ->
        view.screenToLatLng(point)
      }

      AsyncFunction("getDiagnostics") { view: ExpoAmapMapView ->
        view.getDiagnostics()
      }

      AsyncFunction("getNingboOfflineMapStatus") { view: ExpoAmapMapView ->
        view.getNingboOfflineMapStatus()
      }

      AsyncFunction("downloadNingboOfflineMap") { view: ExpoAmapMapView ->
        view.downloadNingboOfflineMap()
      }

      AsyncFunction("deleteNingboOfflineMap") { view: ExpoAmapMapView ->
        view.deleteNingboOfflineMap()
      }
    }
  }

  private fun disposeActiveViews() {
    activeViews.toList().forEach { it.dispose() }
    activeViews.clear()
  }

  private fun destroyActiveViews() {
    activeViews.toList().forEach { it.onHostDestroy() }
    activeViews.clear()
  }
}
