package expo.modules.amapmap

import com.amap.api.maps.offlinemap.OfflineMapStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeMapModelsTest {
  private fun marker(
    id: String,
    latitude: Double = 31.2,
    longitude: Double = 121.4,
    thumbnailKey: String? = null,
    thumbnailUri: String? = null,
    selected: Boolean = false,
  ) = PhotoMarkerInput(
    id = id,
    latitude = latitude,
    longitude = longitude,
    thumbnailKey = thumbnailKey,
    thumbnailUri = thumbnailUri,
    country = "中国",
    province = "上海市",
    city = "上海市",
    selected = selected,
  )

  @Test
  fun markerDiffSeparatesAddRemoveAndInPlaceUpdates() {
    val current = listOf(marker("same"), marker("remove"), marker("coordinate"), marker("thumbnail"), marker("selected"))
    val next = listOf(
      marker("same"),
      marker("add"),
      marker("coordinate", latitude = 32.0),
      marker("thumbnail", thumbnailKey = "thumb-2", thumbnailUri = "file:///cache/thumb-2.jpg"),
      marker("selected", selected = true),
    )

    val diff = diffMarkerInputs(current, next)

    assertEquals(setOf("add"), diff.added)
    assertEquals(setOf("remove"), diff.removed)
    assertEquals(setOf("coordinate"), diff.coordinateUpdated)
    assertEquals(setOf("thumbnail"), diff.thumbnailUpdated)
    assertEquals(setOf("selected"), diff.selectedUpdated)
    assertEquals(setOf("same"), diff.unchanged)
  }

  @Test
  fun cameraComparisonUsesCoordinateAndZoomEpsilon() {
    val base = NativeMapCamera(31.2, 121.4, 9.0)
    assertTrue(camerasEquivalent(base, NativeMapCamera(31.2000001, 121.4000001, 9.0001)))
    assertFalse(camerasEquivalent(base, NativeMapCamera(31.21, 121.4, 9.0)))
    assertFalse(camerasEquivalent(base, NativeMapCamera(31.2, 121.4, 9.1)))
  }

  @Test
  fun markerPauseKeepsOnlyLatestPendingProps() {
    val gate = MarkerUpdateGate()
    gate.submit(listOf(marker("initial")))
    gate.setPaused(true)

    assertNull(gate.submit(listOf(marker("intermediate"))))
    assertNull(gate.submit(listOf(marker("latest"))))
    assertEquals(listOf("initial"), gate.applied.map { it.id })
    assertEquals(listOf("latest"), gate.pending?.map { it.id })

    val resumed = gate.setPaused(false)
    assertEquals(listOf("latest"), resumed?.map { it.id })
    assertNull(gate.pending)
  }

  @Test
  fun thumbnailBoundaryAcceptsOnlyLocalFileUri() {
    assertTrue(safeThumbnailScheme("file:///cache/thumbnail.jpg"))
    assertFalse(safeThumbnailScheme("data:image/jpeg;base64,YQ=="))
    assertFalse(safeThumbnailScheme("https://example.com/full.jpg"))
    assertFalse(safeThumbnailScheme(null))
  }

  @Test
  fun ningboOfflineCityUsesSdkNameOrPinyinWithoutHardcodedCityCode() {
    assertTrue(isNingboOfflineCity("宁波市", null))
    assertTrue(isNingboOfflineCity("Ningbo", "ningbo"))
    assertFalse(isNingboOfflineCity("杭州市", "hangzhou"))
  }

  @Test
  fun offlineDownloadStatusKeepsSuccessAndFailureDistinct() {
    assertEquals("downloading", offlineStateForStatus(OfflineMapStatus.LOADING))
    assertEquals("downloading", offlineStateForStatus(OfflineMapStatus.UNZIP))
    assertEquals("downloaded", offlineStateForStatus(OfflineMapStatus.SUCCESS))
    assertEquals("failed", offlineStateForStatus(OfflineMapStatus.EXCEPTION_NETWORK_LOADING))
    assertEquals("failed", offlineStateForStatus(OfflineMapStatus.START_DOWNLOAD_FAILD))
  }
}
