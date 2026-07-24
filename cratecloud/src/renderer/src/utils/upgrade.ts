import { useLibraryStore } from '../stores/useLibraryStore'
import { useBillingStore } from '../stores/useBillingStore'

// Single navigation path for every locked-feature prompt: jump to Settings
// and flag the Pro card so it scrolls into view and highlights briefly.
export function useGoToUpgrade(): () => void {
  const setActiveTab = useLibraryStore((s) => s.setActiveTab)
  const setHighlightPlanCard = useBillingStore((s) => s.setHighlightPlanCard)

  return () => {
    setHighlightPlanCard('pro')
    setActiveTab('Settings')
  }
}
