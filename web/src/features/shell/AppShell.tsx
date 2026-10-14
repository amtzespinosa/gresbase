import { Outlet } from '@tanstack/react-router'
import { isSidebarCollapsed, usePrefs } from '@/lib/prefs/store'
import { useShortcut } from '@/lib/shortcuts'
import { CommandPalette, ShortcutHelp } from '@/features/palette/CommandPalette'
import { Sidebar } from './Sidebar'

/** Page frame: 12 px padding and gap, floating sidebar card, no top bar (docs/design.md → Layout). */
export function AppShell() {
  const stored = usePrefs((s) => s.sidebarCollapsed)
  const setCollapsed = usePrefs((s) => s.setSidebarCollapsed)
  const collapsed = isSidebarCollapsed(stored)

  useShortcut('toggleSidebar', () => setCollapsed(!collapsed))

  return (
    <div className="flex h-full gap-3 p-3">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className="flex min-w-0 flex-1 gap-3">
        <Outlet />
      </main>
      <CommandPalette />
      <ShortcutHelp />
    </div>
  )
}
