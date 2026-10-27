// System meters for the island: CPU, memory, disks, network and battery.
// Nothing runs in the background: the island asks while its Sistema tab is open,
// and each answer is measured against the previous one (CPU load, network speed).

use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, Networks, RefreshKind, System};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    /// "C:" and the volume name, if any.
    pub mount: String,
    pub label: String,
    pub total: u64,
    pub used: u64,
    pub removable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub percent: u8,
    pub charging: bool,
    pub plugged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub cpu: f32,
    pub cores: Vec<f32>,
    pub cpu_name: String,
    pub mem_total: u64,
    pub mem_used: u64,
    pub disks: Vec<DiskInfo>,
    /// Bytes per second since the last answer.
    pub down: f64,
    pub up: f64,
    pub battery: Option<Battery>,
    pub uptime: u64,
}

struct Mon {
    sys: System,
    disks: Disks,
    disks_at: Instant,
    nets: Networks,
    nets_at: Instant,
}

pub struct SysMon(Mutex<Option<Mon>>);

impl SysMon {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

#[tauri::command]
pub fn system_stats(mon: tauri::State<SysMon>) -> Stats {
    let mut guard = mon.0.lock().unwrap();
    let m = guard.get_or_insert_with(|| Mon {
        sys: System::new_with_specifics(
            RefreshKind::nothing()
                .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
                .with_memory(MemoryRefreshKind::nothing().with_ram()),
        ),
        disks: Disks::new_with_refreshed_list(),
        disks_at: Instant::now(),
        nets: Networks::new_with_refreshed_list(),
        nets_at: Instant::now(),
    });

    m.sys.refresh_cpu_usage();
    m.sys.refresh_memory();
    // Disks change slowly: a fresh look every 10 seconds is plenty.
    if m.disks_at.elapsed().as_secs() >= 10 {
        m.disks.refresh(true);
        m.disks_at = Instant::now();
    }
    let secs = m.nets_at.elapsed().as_secs_f64().max(0.2);
    m.nets.refresh(true);
    m.nets_at = Instant::now();
    let (mut down, mut up) = (0u64, 0u64);
    for (name, data) in m.nets.iter() {
        if name.to_lowercase().contains("loopback") {
            continue;
        }
        down += data.received();
        up += data.transmitted();
    }

    let mut disks: Vec<DiskInfo> = m
        .disks
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| DiskInfo {
            mount: d.mount_point().to_string_lossy().trim_end_matches('\\').to_string(),
            label: d.name().to_string_lossy().to_string(),
            total: d.total_space(),
            used: d.total_space().saturating_sub(d.available_space()),
            removable: d.is_removable(),
        })
        .collect();
    disks.sort_by(|a, b| a.mount.cmp(&b.mount));
    disks.dedup_by(|a, b| a.mount == b.mount);

    Stats {
        cpu: m.sys.global_cpu_usage(),
        cores: m.sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        cpu_name: m.sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        mem_total: m.sys.total_memory(),
        mem_used: m.sys.used_memory(),
        disks,
        down: down as f64 / secs,
        up: up as f64 / secs,
        battery: battery(),
        uptime: System::uptime(),
    }
}

#[cfg(windows)]
fn battery() -> Option<Battery> {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut s).ok()? };
    // 128 = no battery, 255 = unknown.
    if s.BatteryFlag & 128 != 0 || s.BatteryFlag == 255 || s.BatteryLifePercent > 100 {
        return None;
    }
    Some(Battery {
        percent: s.BatteryLifePercent,
        charging: s.BatteryFlag & 8 != 0,
        plugged: s.ACLineStatus == 1,
    })
}

#[cfg(not(windows))]
fn battery() -> Option<Battery> {
    None
}
