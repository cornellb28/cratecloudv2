import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibraryStore } from '../stores/useLibraryStore'
import type { Track } from '../types/track'
import { findDuplicateClusters, pairKey, estimateBitrateKbps } from '../utils/duplicateDetection'

type Props = { onClose: () => void }

function formatDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return 'Unknown'
  return new Date(unixSeconds * 1000).toLocaleDateString()
}

function formatSize(mb: number | undefined): string {
  return mb != null ? `${mb.toFixed(1)} MB` : '—'
}

function allPairs(ids: number[]): [number, number][] {
  const pairs: [number, number][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]])
  }
  return pairs
}

export function DuplicatesModal({ onClose }: Props): React.JSX.Element {
  const { allTracks, openDeleteDialog } = useLibraryStore()

  const [clusters, setClusters] = useState<Track[][] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [keptByCluster, setKeptByCluster] = useState<Record<number, number>>({}) // clusterIdx -> trackId

  const runScan = async () => {
    setScanning(true)
    try {
      const dismissed = await window.api.dupes.getDismissed()
      const dismissedKeys = new Set(dismissed.map((p) => pairKey(p.track_id_a, p.track_id_b)))

      const found = findDuplicateClusters(allTracks())
      const remaining = found.filter((cluster) => {
        const ids = cluster.map((t) => t.id)
        return allPairs(ids).some(([a, b]) => !dismissedKeys.has(pairKey(a, b)))
      })

      setClusters(remaining)
      setKeptByCluster({})
    } finally {
      setScanning(false)
    }
  }

  const dismissCluster = async (clusterIdx: number) => {
    const cluster = clusters![clusterIdx]
    const ids = cluster.map((t) => t.id)
    await Promise.all(allPairs(ids).map(([a, b]) => window.api.dupes.dismiss(a, b)))
    setClusters((cur) => cur!.filter((_, i) => i !== clusterIdx))
  }

  const deleteOthers = (clusterIdx: number) => {
    const cluster = clusters![clusterIdx]
    const keepId = keptByCluster[clusterIdx]
    if (keepId == null) return
    const otherIds = cluster.filter((t) => t.id !== keepId).map((t) => t.id)
    openDeleteDialog(otherIds)
    setClusters((cur) => cur!.filter((_, i) => i !== clusterIdx))
  }

  return createPortal(
    <div className="ted-backdrop" onClick={onClose}>
      <div className="dupes-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bem-header">
          <span className="bem-title">Duplicate Tracks</span>
          <button className="ted-close" onClick={onClose} type="button">✕</button>
        </div>

        <div className="dupes-intro">
          <p>
            Matches tracks by normalized artist + title. Not audio fingerprinting — review each
            group before deleting anything.
          </p>
          <button className="bem-btn primary" onClick={runScan} disabled={scanning} type="button">
            {scanning ? 'Scanning…' : 'Scan for duplicates'}
          </button>
        </div>

        {clusters !== null && clusters.length === 0 && (
          <div className="dupes-empty">No possible duplicates found.</div>
        )}

        {clusters !== null && clusters.map((cluster, clusterIdx) => (
          <div key={clusterIdx} className="dupes-cluster">
            <div className="dupes-cluster-header">
              <span>{cluster[0].artist} — {cluster[0].title}</span>
              <span className="dupes-cluster-count">{cluster.length} candidates</span>
            </div>

            <table className="dupes-table">
              <thead>
                <tr>
                  <th />
                  <th>Path</th>
                  <th>Duration</th>
                  <th>Size</th>
                  <th>~Bitrate</th>
                  <th>Format</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {cluster.map((t) => {
                  const bitrate = estimateBitrateKbps(t)
                  return (
                    <tr key={t.id}>
                      <td>
                        <input
                          type="radio"
                          name={`keep-${clusterIdx}`}
                          checked={keptByCluster[clusterIdx] === t.id}
                          onChange={() => setKeptByCluster((cur) => ({ ...cur, [clusterIdx]: t.id }))}
                          title="Keep this one"
                        />
                      </td>
                      <td className="dupes-path" title={t.filepath}>{t.filepath ?? '—'}</td>
                      <td>{t.duration_str ?? '—'}</td>
                      <td>{formatSize(t.file_size_mb)}</td>
                      <td>{bitrate ? `${bitrate} kbps` : '—'}</td>
                      <td>{t.format ?? '—'}</td>
                      <td>{formatDate(t.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="dupes-cluster-actions">
              <button
                className="bem-btn"
                onClick={() => dismissCluster(clusterIdx)}
                type="button"
              >
                Not a duplicate — dismiss
              </button>
              <button
                className="bem-btn primary"
                onClick={() => deleteOthers(clusterIdx)}
                disabled={keptByCluster[clusterIdx] == null}
                type="button"
                title={keptByCluster[clusterIdx] == null ? 'Pick which one to keep first' : undefined}
              >
                Keep selected, delete others…
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}
