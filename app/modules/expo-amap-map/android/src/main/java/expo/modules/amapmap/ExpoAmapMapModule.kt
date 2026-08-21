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
      activeViews.toList().forEach { it.onActivityForeground() }
    }

    OnActivityEntersBackground {
      activeViews.toList().forEach { it.onActivityBackground() }
    }

    OnActivityDestroys {
      disposeActiveViews()
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
        "onNativeError"
      )

      OnViewDidUpdateProps { view ->
        activeViews.add(view)
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
    }
  }

  private fun disposeActiveViews() {
    activeViews.toList().forEach { it.dispose() }
    activeViews.clear()
  }
}
