const multer = require('multer')
const sharp = require('sharp')
const path = require('node:path')
const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
const filenamePattern = /^[0-9a-f-]{36}\.(jpg|png|webp)$/
const imageDirectory = () => path.resolve(process.env.EQUIPMENT_IMAGE_DIR || path.join(__dirname, 'uploads', 'equipment'))
const invalid = message => Object.assign(new Error(message), { status: 400 })

// Only attached to administrator equipment saves, after authorization.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 8, parts: 9, fieldSize: 8192, fieldNameSize: 100 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase()
    const validExtension = { jpeg: ['.jpg', '.jpeg'], png: ['.png'], webp: ['.webp'] }
    if (!validExtension[formats[file.mimetype]]?.includes(extension)) {
      return callback(invalid('Choose a JPG, PNG or WebP image.'))
    }
    callback(null, true)
  }
}).single('image')

function equipmentUpload(req, res, next) {
  upload(req, res, error => {
    if (error) {
      if (error instanceof multer.MulterError) {
        return next(Object.assign(new Error(error.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 5 MB or smaller.' : 'Upload one image with the equipment fields only.'),
        { status: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400 }))
      }
      return next(error.status ? error : invalid('Invalid image upload.'))
    }
    // Multipart text fields arrive as strings; JSON behavior remains unchanged.
    if (req.is('multipart/form-data') && /^\d+$/.test(req.body?.revision)) req.body.revision = Number(req.body.revision)
    next()
  })
}

async function removeImage(filename) {
  if (!filenamePattern.test(filename || '')) return
  try { await fs.unlink(path.join(imageDirectory(), filename)) }
  catch (error) { if (error.code !== 'ENOENT') console.error('Unable to remove equipment image:', error.code) }
}

async function storeImage(file) {
  let buffer, format
  try {
    const input = sharp(file.buffer, { limitInputPixels: 25000000, failOn: 'warning' })
    const metadata = await input.metadata()
    format = formats[file.mimetype]
    if (metadata.format !== format || (metadata.pages || 1) !== 1) throw new Error('Invalid format')
    // Decode and re-encode: filenames, appended payloads and EXIF metadata are not retained.
    buffer = await input.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .toFormat(format).toBuffer()
  } catch {
    throw invalid('Upload a valid, non-animated JPG, PNG or WebP image (maximum 25 megapixels).')
  }
  const filename = `${randomUUID()}.${format === 'jpeg' ? 'jpg' : format}`
  await fs.mkdir(imageDirectory(), { recursive: true })
  try { await fs.writeFile(path.join(imageDirectory(), filename), buffer, { flag: 'wx' }) }
  catch (error) { await removeImage(filename); throw error }
  return filename
}

// Keep the old image until the database write succeeds; remove new files on failed saves.
async function saveWithImage(req, previousImage, save) {
  const filename = req.file ? await storeImage(req.file) : undefined
  let result
  try { result = await save(filename) }
  catch (error) { await removeImage(filename); throw error }
  if (filename) await removeImage(previousImage)
  return result
}

module.exports = { equipmentUpload, saveWithImage, imageDirectory, filenamePattern }
