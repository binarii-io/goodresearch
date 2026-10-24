import { describe, expect, it } from 'vitest'
import { parseDriveFolderLink } from '../domain/drive-link.ts'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'

describe('parseDriveFolderLink', () => {
  it.each([
    `https://drive.google.com/drive/folders/${ID}`,
    `https://drive.google.com/drive/folders/${ID}?usp=sharing`,
    `https://drive.google.com/drive/u/1/folders/${ID}`,
    `https://drive.google.com/open?id=${ID}`,
    `  ${ID}  `,
  ])('accepts %s', (input) => {
    expect(parseDriveFolderLink(input)).toEqual({ ok: true, value: ID })
  })

  it.each([
    `https://docs.google.com/document/d/${ID}/edit`,
    `https://drive.google.com/file/d/${ID}/view`,
    `https://example.com/drive/folders/${ID}`,
    'https://drive.google.com/drive/my-drive',
    'not a link',
    '',
  ])('rejects %s', (input) => {
    expect(parseDriveFolderLink(input)).toEqual({ ok: false, error: 'NOT_A_DRIVE_FOLDER_LINK' })
  })
})
