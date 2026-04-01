import { describe, expect, it } from 'vitest'
import {
  buildWorkshopArgs,
  extractWorkshopFileIdsFromHtml,
  isBenignSteamLatencyWarning,
  isWorkshopSuccessLine,
  isSteamGuardPrompt,
  mergeWorkshopItems,
  normalizeWorkshopItems,
  parseWorkshopRunFailure,
  parseSteamLoginFailure,
  resolveLoginTimeoutMs
} from '../../src/backend/services/steamcmd-runtime-service'

describe('steamcmd runtime helpers', () => {
  it('builds workshop upload args in expected order', () => {
    const args = buildWorkshopArgs('alice', 'secret', '/tmp/test.vdf')
    expect(args).toEqual(['+login', 'alice', 'secret', '+workshop_build_item', '/tmp/test.vdf', '+quit'])
  })

  it('detects steam guard prompt variants', () => {
    expect(isSteamGuardPrompt('Steam Guard code:')).toBe(true)
    expect(isSteamGuardPrompt('Please enter two-factor authentication code')).toBe(true)
    expect(isSteamGuardPrompt('Work complete')).toBe(false)
  })

  it('extracts unique workshop ids from community html', () => {
    const html = `
      <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=123">One</a>
      <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=456">Two</a>
      <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=123">Dup</a>
    `

    expect(extractWorkshopFileIdsFromHtml(html)).toEqual(['123', '456'])
  })

  it('classifies invalid password login failures', () => {
    const failure = parseSteamLoginFailure([
      "Logging in user 'alice' to Steam Public...",
      'Login Failure: InvalidPassword'
    ])

    expect(failure).toEqual({
      code: 'auth',
      message: 'Steam login failed: username or password is incorrect.'
    })
  })

  it('classifies invalid steam guard code failures', () => {
    const failure = parseSteamLoginFailure([
      'This account is protected by Steam Guard.',
      'ERROR! Invalid authentication code.'
    ])

    expect(failure).toEqual({
      code: 'steam_guard',
      message: 'Steam Guard code is invalid or expired. Enter a fresh code and retry.'
    })
  })

  it('classifies missing cached credentials for saved-session login', () => {
    const failure = parseSteamLoginFailure([
      'Logging in using cached credentials.',
      'Cached credentials not found.'
    ])

    expect(failure).toEqual({
      code: 'auth',
      message: 'Saved Steam session is not available. Enter password to sign in again.'
    })
  })

  it('uses a longer timeout for full logins than stored-session reuse', () => {
    expect(resolveLoginTimeoutMs(false)).toBe(30_000)
    expect(resolveLoginTimeoutMs(true)).toBe(10_000)
  })

  it('merges workshop items by id and keeps latest data', () => {
    const merged = mergeWorkshopItems([
      {
        publishedFileId: '1',
        title: 'Old',
        appId: '480',
        visibility: 0,
        updatedAt: 100
      },
      {
        publishedFileId: '1',
        title: 'New',
        appId: '480',
        visibility: 2,
        updatedAt: 200
      },
      {
        publishedFileId: '2',
        title: 'Second',
        appId: '480',
        visibility: 1,
        updatedAt: 150
      }
    ])

    expect(merged).toEqual([
      {
        publishedFileId: '1',
        title: 'New',
        appId: '480',
        visibility: 2,
        updatedAt: 200
      },
      {
        publishedFileId: '2',
        title: 'Second',
        appId: '480',
        visibility: 1,
        updatedAt: 150
      }
    ])
  })

  it('preserves known visibility when replacement item omits it', () => {
    const merged = mergeWorkshopItems([
      {
        publishedFileId: '9',
        title: 'Known Visibility',
        appId: '480',
        visibility: 0,
        updatedAt: 200
      },
      {
        publishedFileId: '9',
        title: 'Same Timestamp New Title',
        appId: '480',
        updatedAt: 200
      }
    ])

    expect(merged).toEqual([
      {
        publishedFileId: '9',
        title: 'Known Visibility',
        appId: '480',
        visibility: 0,
        updatedAt: 200
      }
    ])
  })

  it('extracts app id from multiple steam field variants', () => {
    const normalized = normalizeWorkshopItems({
      response: {
        publishedfiledetails: [
          {
            publishedfileid: '11',
            title: 'Consumer string',
            consumer_appid: '255710',
            time_updated: 10
          },
          {
            publishedfileid: '12',
            title: 'Creator fallback',
            creator_app_id: 480,
            time_updated: 20
          }
        ]
      }
    })

    expect(normalized).toEqual([
      {
        publishedFileId: '12',
        title: 'Creator fallback',
        appId: '480',
        updatedAt: 20
      },
      {
        publishedFileId: '11',
        title: 'Consumer string',
        appId: '255710',
        updatedAt: 10
      }
    ])
  })

  it('extracts and deduplicates tags from steam payloads', () => {
    const normalized = normalizeWorkshopItems({
      response: {
        publishedfiledetails: [
          {
            publishedfileid: '11',
            title: 'Tagged item',
            consumer_appid: '255710',
            time_updated: 10,
            tags: [{ tag: 'MOD' }, { tag: 'mod' }, { tag: 'Maps' }]
          }
        ]
      }
    })

    expect(normalized).toEqual([
      {
        publishedFileId: '11',
        title: 'Tagged item',
        appId: '255710',
        updatedAt: 10,
        tags: ['MOD', 'Maps']
      }
    ])
  })

  it('keeps known tags when replacement item omits them', () => {
    const merged = mergeWorkshopItems([
      {
        publishedFileId: '9',
        title: 'Known Tags',
        appId: '480',
        tags: ['Mod'],
        updatedAt: 200
      },
      {
        publishedFileId: '9',
        title: 'Known Tags',
        appId: '480',
        updatedAt: 200
      }
    ])

    expect(merged).toEqual([
      {
        publishedFileId: '9',
        title: 'Known Tags',
        appId: '480',
        tags: ['Mod'],
        updatedAt: 200
      }
    ])
  })

  it('classifies workshop manifest timeout failures', () => {
    const failure = parseWorkshopRunFailure(
      [
        'Uploading content...',
        '[2026-03-12 22:01:45]: ERROR! Timeout uploading manifest (size 967)',
        'ERROR! Failed to update workshop item (Failure).'
      ],
      'update'
    )

    expect(failure).toBe(
      'Steam upload timed out while sending the manifest. Retry in a minute and check network/Steam service status.'
    )
  })

  it('classifies expired steam session on workshop operations', () => {
    const failure = parseWorkshopRunFailure(
      ['ERROR! Not logged on', 'Please use +login before running this command.'],
      'upload'
    )

    expect(failure).toBe('Steam session is not valid anymore. Sign in again and retry.')
  })

  it('classifies Steam internal IPC latency lines as benign warnings', () => {
    expect(
      isBenignSteamLatencyWarning('IPC function call IClientUGC::GetItemUpdateProgress took too long: 79 msec')
    ).toBe(true)
    expect(
      isBenignSteamLatencyWarning('IPC function call IClientUtils::GetAPICallResult took too long: 60 msec')
    ).toBe(true)
    expect(isBenignSteamLatencyWarning('Uploading content...')).toBe(false)
  })

  it('detects workshop success when Success. appears in a combined line', () => {
    expect(isWorkshopSuccessLine('Committing update...Success.')).toBe(true)
    expect(isWorkshopSuccessLine('Success.')).toBe(true)
    expect(isWorkshopSuccessLine('Committing update...')).toBe(false)
  })

  it('keeps real failure classification when benign warning also exists', () => {
    const failure = parseWorkshopRunFailure(
      [
        'IPC function call IClientUGC::GetItemUpdateProgress took too long: 79 msec',
        'ERROR! Timeout uploading manifest (size 967)'
      ],
      'update'
    )
    expect(failure).toBe(
      'Steam upload timed out while sending the manifest. Retry in a minute and check network/Steam service status.'
    )
  })

  it('classifies no-connection failures with retry count', () => {
    const failure = parseWorkshopRunFailure(
      [
        "Logging in user 'alice' to Steam Public...",
        'Retrying...',
        'Retrying...',
        'Retrying...',
        'Retrying...',
        'ERROR (No Connection)'
      ],
      'update'
    )

    expect(failure).toBe('Steam connection failed after 4 retries. Check internet/Steam status and retry.')
  })

  it('classifies connection failures without retries', () => {
    const failure = parseWorkshopRunFailure(
      ['Preparing content...', 'ERROR (No Connection)'],
      'upload'
    )

    expect(failure).toBe('Steam connection failed. Check internet/Steam status and retry.')
  })

  it('classifies missing content build failures with a short actionable message', () => {
    const failure = parseWorkshopRunFailure(
      [
        '[2026-03-12 23:01:34]: ERROR! Build for workshop item has no content',
        'ERROR! Failed to update workshop item (Failure).'
      ],
      'update'
    )

    expect(failure).toBe('No mod content found. Select a content folder with files, then retry.')
  })

  it('classifies create access denied failures with a permissions-focused message', () => {
    const failure = parseWorkshopRunFailure(
      ['ERROR! Failed to create new workshop item (Access Denied).'],
      'upload'
    )

    expect(failure).toBe(
      'Steam denied creating this Workshop item (Access Denied). Verify app ownership/permissions and ensure your Steam account can publish for this game.'
    )
  })
})
