// Shared by GenreView and ArtistView. LibraryView has no equivalent to copy
// (it renders the whole in-memory library synchronously, no lazy UI) —
// sized to match real rows/cards since these browse views are genuinely
// paginated. Split from browseShared.ts (pure logic) so this file stays
// components-only, which Fast Refresh requires.
//
// colSpan is 13 to match the canonical TrackCard's list-mode column count
// (Section 3) — was 10 when these views had their own hand-rolled table.

export function ListPlaceholderRows({ count }: { count: number }): React.JSX.Element {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={i} className="gv-placeholder-row">
          <td colSpan={13}>
            <div className="gv-placeholder-bar" />
          </td>
        </tr>
      ))}
    </>
  )
}

// Shared by Grid mode (.lib-grid-item, 300px) and each board column
// (.track-card, 76px) — those two contexts need different placeholder
// heights, hence the variant prop.
export function GridPlaceholderCards({
  count,
  variant
}: {
  count: number
  variant: 'grid' | 'board'
}): React.JSX.Element {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`gv-placeholder-card gv-placeholder-card-${variant}`} />
      ))}
    </>
  )
}
