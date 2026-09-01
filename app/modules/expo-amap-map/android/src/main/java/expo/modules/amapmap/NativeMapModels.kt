package expo.modules.amapmap

import kotlin.math.abs

internal const val MAP_COORDINATE_EPSILON = 0.000001
internal const val MAP_ZOOM_EPSILON = 0.001

internal data class PhotoMarkerInput(
  val id: String,
  val latitude: Double,
  val longitude: Double,
  val thumbnailKey: String?,
  val thumbnailUri: String?,
  val country: String?,
  val province: String?,
  val city: String?,
  val selected: Boolean,
)

internal data class NativeMapCamera(
  val latitude: Double,
  val longitude: Double,
  val zoom: Double,
)

internal data class MarkerInputDiff(
  val added: Set<String>,
  val removed: Set<String>,
  val coordinateUpdated: Set<String>,
  val thumbnailUpdated: Set<String>,
  val selectedUpdated: Set<String>,
  val unchanged: Set<String>,
)

internal fun diffMarkerInputs(
  current: Collection<PhotoMarkerInput>,
  next: Collection<PhotoMarkerInput>,
): MarkerInputDiff {
  val currentById = current.associateBy { it.id }
  val nextById = next.associateBy { it.id }
  val coordinateUpdated = mutableSetOf<String>()
  val thumbnailUpdated = mutableSetOf<String>()
  val selectedUpdated = mutableSetOf<String>()
  val unchanged = mutableSetOf<String>()

  nextById.forEach { (id, marker) ->
    val existing = currentById[id] ?: return@forEach
    var changed = false
    if (
      abs(existing.latitude - marker.latitude) >= MAP_COORDINATE_EPSILON ||
      abs(existing.longitude - marker.longitude) >= MAP_COORDINATE_EPSILON
    ) {
      coordinateUpdated += id
      changed = true
    }
    if (
      existing.thumbnailKey != marker.thumbnailKey ||
      existing.thumbnailUri != marker.thumbnailUri
    ) {
      thumbnailUpdated += id
      changed = true
    }
    if (existing.selected != marker.selected) {
      selectedUpdated += id
      changed = true
    }
    if (!changed) unchanged += id
  }

  return MarkerInputDiff(
    added = nextById.keys - currentById.keys,
    removed = currentById.keys - nextById.keys,
    coordinateUpdated = coordinateUpdated,
    thumbnailUpdated = thumbnailUpdated,
    selectedUpdated = selectedUpdated,
    unchanged = unchanged,
  )
}

internal fun camerasEquivalent(
  left: NativeMapCamera?,
  right: NativeMapCamera?,
): Boolean {
  if (left == null || right == null) return left == right
  return abs(left.latitude - right.latitude) < MAP_COORDINATE_EPSILON &&
    abs(left.longitude - right.longitude) < MAP_COORDINATE_EPSILON &&
    abs(left.zoom - right.zoom) < MAP_ZOOM_EPSILON
}

internal class MarkerUpdateGate {
  var applied: List<PhotoMarkerInput> = emptyList()
    private set
  var pending: List<PhotoMarkerInput>? = null
    private set
  var paused: Boolean = false
    private set

  fun submit(markers: List<PhotoMarkerInput>): List<PhotoMarkerInput>? {
    if (paused) {
      pending = markers
      return null
    }
    applied = markers
    pending = null
    return applied
  }

  fun setPaused(nextPaused: Boolean): List<PhotoMarkerInput>? {
    if (paused == nextPaused) return null
    paused = nextPaused
    if (nextPaused) return null
    val latest = pending ?: return null
    applied = latest
    pending = null
    return applied
  }

  fun clear() {
    applied = emptyList()
    pending = null
    paused = false
  }
}

internal fun safeThumbnailScheme(uri: String?): Boolean =
  uri?.startsWith("file://", ignoreCase = true) == true
