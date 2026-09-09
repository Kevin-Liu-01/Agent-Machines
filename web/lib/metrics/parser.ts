/**
 * Parse Linux proc/sys output from a single batched command into
 * structured resource metrics.
 *
 * Expected input is the concatenated output of:
 *   cat /proc/stat && echo '---DELIM---' && free -b && echo '---DELIM---' \
 *   && df -B1 "$HOME" && echo '---DELIM---' && cat /proc/loadavg
 */

export type ResourceSnapshot = {
	cpuPercent: number;
	memoryUsedMib: number;
	memoryTotalMib: number;
	storageUsedGib: number;
	storageTotalGib: number;
	loadAvg1m: number;
};

const DELIM = "---DELIM---";
const BYTES_PER_MIB = 1024 * 1024;
const BYTES_PER_GIB = 1024 * 1024 * 1024;

export function parseResourceSnapshot(
	output: string,
): ResourceSnapshot | null {
	const sections = output.split(DELIM).map((s) => s.trim());
	if (sections.length < 4) return null;

	const cpu = parseCpu(sections[0]!);
	const mem = parseMemory(sections[1]!);
	const disk = parseDisk(sections[2]!);
	const load = parseLoadAvg(sections[3]!);

	if (cpu === null || mem === null || disk === null || load === null) {
		return null;
	}

	return {
		cpuPercent: cpu,
		memoryUsedMib: mem.usedMib,
		memoryTotalMib: mem.totalMib,
		storageUsedGib: disk.usedGib,
		storageTotalGib: disk.totalGib,
		loadAvg1m: load,
	};
}

/**
 * Parse the aggregate `cpu` line from /proc/stat.
 * Fields: user nice system idle iowait irq softirq steal [guest guest_nice]
 * CPU% = (total - idle - iowait) / total * 100
 */
function parseCpu(section: string): number | null {
	const match = section.match(
		/^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m,
	);
	if (!match) return null;

	const [, user, nice, system, idle, iowait, irq, softirq, steal] =
		match.map(Number);
	const total =
		user! + nice! + system! + idle! + iowait! + irq! + softirq! + steal!;
	if (total === 0) return 0;

	const nonIdle = total - idle! - iowait!;
	return Math.round((nonIdle / total) * 10000) / 100;
}

/**
 * Parse `free -b` output. Looks for the "Mem:" row and extracts
 * total and available columns.
 *
 *               total        used        free      shared  buff/cache   available
 * Mem:    xxxxx        xxxxx       xxxxx       xxxxx       xxxxx       xxxxx
 */
function parseMemory(
	section: string,
): { usedMib: number; totalMib: number } | null {
	const match = section.match(
		/^Mem:\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/m,
	);
	if (!match) return null;

	const totalBytes = Number(match[1]);
	const availableBytes = Number(match[2]);
	return {
		totalMib: Math.round((totalBytes / BYTES_PER_MIB) * 100) / 100,
		usedMib:
			Math.round(((totalBytes - availableBytes) / BYTES_PER_MIB) * 100) / 100,
	};
}

/**
 * Parse `df -B1 /home/machine` output.
 *
 * Filesystem     1B-blocks      Used Available Use% Mounted on
 * /dev/vda1      xxxxxxxxx xxxxxxxxx xxxxxxxxx  xx% /home/machine
 */
function parseDisk(
	section: string,
): { usedGib: number; totalGib: number } | null {
	const lines = section.split("\n").filter((l) => l.trim());
	const dataLine = lines.find((l) => /^\S/.test(l) && !l.startsWith("Filesystem"));
	if (!dataLine) return null;

	const cols = dataLine.trim().split(/\s+/);
	if (cols.length < 4) return null;

	const totalBytes = Number(cols[1]);
	const usedBytes = Number(cols[2]);
	if (!Number.isFinite(totalBytes) || !Number.isFinite(usedBytes)) return null;

	return {
		totalGib: Math.round((totalBytes / BYTES_PER_GIB) * 1000) / 1000,
		usedGib: Math.round((usedBytes / BYTES_PER_GIB) * 1000) / 1000,
	};
}

function parseLoadAvg(section: string): number | null {
	const match = section.match(/^([\d.]+)/);
	if (!match) return null;
	const val = Number(match[1]);
	return Number.isFinite(val) ? val : null;
}
