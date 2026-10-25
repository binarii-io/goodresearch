/** Saves a text file built in the browser (spec 006 research R5: no endpoint needed). */
export const downloadText = (filename: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the file after `click` returns: free it a little later (PR #6 review).
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A file name from a study name ("Interviews Q4" → "interviews-q4"). */
export const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'study'
