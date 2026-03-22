/**
 * Overview: Shared visibility metadata and styling helpers for publish/update flows.
 * Responsibility: Maps Steam visibility values to labels/hints/tooltips and returns mode-aware style classes for cards, 
 * options, actions, and preview accents.
 */
export const visibilityOptions = [0, 1, 2, 3] as const

export function visibilityLabel(value: 0 | 1 | 2 | 3): string {
  if (value === 0) return 'Public'
  if (value === 1) return 'Friends-only'
  if (value === 2) return 'Hidden'
  return 'Unlisted'
}

export function visibilityHint(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'This item is visible to everyone and can appear in searches and on your profile.'
  }
  if (value === 1) {
    return 'This item is only visible in searches to you, your friends, and admins.'
  }
  if (value === 2) {
    return 'This item is only visible to you, admins, and anyone marked as a creator.'
  }
  return 'This item is visible to everyone, but will not show up in searches or on your profile.'
}

export function visibilityTooltip(value: 0 | 1 | 2 | 3): string {
  return `${visibilityLabel(value)}: ${visibilityHint(value)}`
}

export function visibilityCardClass(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'border-[#58c796] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(88,199,150,0.44)_0%,rgba(60,130,105,0.28)_30%,rgba(19,36,55,0.96)_72%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(88,199,150,0.38),0_0_24px_rgba(45,152,112,0.26)]'
  }
  if (value === 1) {
    return 'border-[#f0bc71] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(240,188,113,0.44)_0%,rgba(150,100,44,0.28)_30%,rgba(19,36,55,0.96)_72%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(240,188,113,0.38),0_0_24px_rgba(178,118,44,0.26)]'
  }
  if (value === 2) {
    return 'border-[#da8faa] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(218,143,170,0.44)_0%,rgba(130,62,84,0.28)_30%,rgba(19,36,55,0.96)_72%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(218,143,170,0.38),0_0_24px_rgba(153,66,96,0.26)]'
  }
  return 'border-[#9f81df] bg-[radial-gradient(120%_160%_at_0%_0%,rgba(159,129,223,0.36)_0%,rgba(104,75,168,0.22)_30%,rgba(19,36,55,0.96)_72%),linear-gradient(135deg,rgba(24,44,64,0.96)_0%,rgba(16,31,46,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(159,129,223,0.35),0_0_22px_rgba(105,75,170,0.22)]'
}

export function visibilityOptionClass(option: 0 | 1 | 2 | 3, selected: boolean): string {
  const base =
    'group relative flex h-9 w-[132px] items-center justify-center gap-1.5 rounded border px-2 text-xs font-semibold transition-colors duration-200'

  if (!selected) {
    return `${base} border-[#3a5a76] bg-[#132334] text-[#9fb1bf] hover:bg-[#1a2d40]`
  }

  if (option === 0) {
    return `${base} border-[#61c799] bg-[#2d6d52] text-[#e4fff1] shadow-[inset_0_0_0_1px_rgba(97,199,153,0.34)]`
  }
  if (option === 1) {
    return `${base} border-[#edbb6d] bg-[#7a4f21] text-[#fff0cd] shadow-[inset_0_0_0_1px_rgba(237,187,109,0.34)]`
  }
  if (option === 2) {
    return `${base} border-[#d78da5] bg-[#733247] text-[#ffe5ed] shadow-[inset_0_0_0_1px_rgba(215,141,165,0.34)]`
  }
  return `${base} border-[#9d83d8] bg-[#4a356f] text-[#f0e8ff] shadow-[inset_0_0_0_1px_rgba(157,131,216,0.34)]`
}

export function visibilityActionClass(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'border-[#61c799] bg-[#3c8f6a] hover:bg-[#4ca982]'
  }
  if (value === 1) {
    return 'border-[#edbb6d] bg-[#ba7527] hover:bg-[#cf8733]'
  }
  if (value === 2) {
    return 'border-[#d78da5] bg-[#a94a67] hover:bg-[#bf5d7c]'
  }
  return 'border-[#9379c8] bg-[#5b448d] hover:bg-[#7156a8]'
}

export function previewBorderClass(value: 0 | 1 | 2 | 3): string {
  if (value === 0) {
    return 'border-[#58c796] shadow-[0_0_0_1px_rgba(88,199,150,0.3)]'
  }
  if (value === 1) {
    return 'border-[#f0bc71] shadow-[0_0_0_1px_rgba(240,188,113,0.3)]'
  }
  if (value === 2) {
    return 'border-[#da8faa] shadow-[0_0_0_1px_rgba(218,143,170,0.3)]'
  }
  return 'border-[#9f81df] shadow-[0_0_0_1px_rgba(159,129,223,0.3)]'
}
