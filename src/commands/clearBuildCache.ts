import * as fs from 'fs'
import { projectDirectory, sidebarTreeView } from "../extension"
import { buildDevFolder, isBuilding, isClearedBuildCache, isClearingBuildCache, LogLevel, print, setClearedBuildCache, setClearingBuildCache, status, StatusType } from "../webber"
import { TimeMeasure } from '../helpers/timeMeasureHelper'
import { createSymlinkFoldersIfNeeded } from '../swift'

export function clearBuildCacheCommand() {
	if (isBuilding) return
	if (isClearingBuildCache || isClearedBuildCache) return
	setClearingBuildCache(true)
	sidebarTreeView?.refresh()
	const swiftPMCache = `/root/.cache/org.swift.swiftpm`
	const buildCacheFolder = `${projectDirectory}/.build`
	const buildDevFolderPath = `${projectDirectory}/${buildDevFolder}`
	print(`🧹 Clearing Build Cache`, LogLevel.Detailed)
	const measure = new TimeMeasure()
	if (fs.existsSync(swiftPMCache))
		fs.rmSync(swiftPMCache, { recursive: true, force: true })
	if (fs.existsSync(buildCacheFolder))
		fs.rmSync(buildCacheFolder, { recursive: true, force: true })
	if (fs.existsSync(buildDevFolderPath))
		fs.rmSync(buildDevFolderPath, { recursive: true, force: true })
	createSymlinkFoldersIfNeeded()
	measure.finish()
	function afterClearing() {
		setClearingBuildCache(false)
		setClearedBuildCache(true)
		sidebarTreeView?.refresh()
		status('check', `Cleared Build Cache in ${measure.time}ms`, StatusType.Success)
		print(`🧹 Cleared Build Cache in ${measure.time}ms`, LogLevel.Detailed)
		setTimeout(() => {
			setClearedBuildCache(false)
			sidebarTreeView?.refresh()
		}, 1000)
	}
	if (measure.time < 1000) {
		setTimeout(() => {
			afterClearing()
		}, 1000)
	} else {
		afterClearing()
	}
}