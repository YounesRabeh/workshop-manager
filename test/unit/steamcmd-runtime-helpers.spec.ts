import { describe, expect, it } from 'vitest'
import {
  buildWorkshopArgs,
  extractWorkshopFileIdsFromHtml,
  isBenignSteamLatencyWarning,
  isSteamGuardPrompt,
  mergeWorkshopItems,
  normalizeWorkshopItems,
  parseWorkshopRunFailure,
  parseSteamLoginFailure
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
})
