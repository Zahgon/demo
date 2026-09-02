import { ReturnType } from 'typebox'
import path from 'path'
import { MultipartFile } from '../../external/multipart.js'
import { AppInstance } from '../../../lib/instance.js'

declare global {
  namespace Express {
    export interface Application {
      tasksFileManager: ReturnType<typeof createUploader>
    }
  }
}

function createUploader (app: AppInstance) {
  const { fileManager } = app

  const uploadPath = path.join(
    import.meta.dirname,
    '../../../..',
    app.config.UPLOAD_DIRNAME,
    app.config.UPLOAD_TASKS_DIRNAME
  )

  const tempPath = path.join(uploadPath, 'temp')

  fileManager.ensureDir(uploadPath)
  fileManager.ensureDir(tempPath)

  const buildFilePath = (filename: string) => fileManager.safeJoin(uploadPath, filename)
  const buildTempFilePath = (filename: string) => fileManager.safeJoin(tempPath, filename)

  return {
    async upload (filename: string, file: MultipartFile) {
      const filePath = buildFilePath(filename)
      await fileManager.upload(file, filePath)
    },

    async moveOldToTemp (oldFilename: string) {
      const oldPath = buildFilePath(oldFilename)
      const randomPart = fileManager.randomSuffix()
      const oldTempFilename = `temp-${randomPart}-${oldFilename}`
      const tempFilePath = buildTempFilePath(oldTempFilename)

      await fileManager.move(oldPath, tempFilePath)
      return oldTempFilename
    },

    async moveTempToOld (tempFilename: string, oldFilename: string) {
      const tempPath = buildTempFilePath(tempFilename)
      const oldPath = buildFilePath(oldFilename)

      await fileManager.move(tempPath, oldPath)
    },

    async delete (filename: string) {
      const filePath = buildFilePath(filename)
      await fileManager.unlink(filePath)
    },

    buildFilePath
  }
}

export default async function (app: AppInstance) {
  app.tasksFileManager = createUploader(app)
}
