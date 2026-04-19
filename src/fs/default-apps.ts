import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./files";

/**
 * Open Windows' Default Apps settings page.
 *
 *   openDefaultAppsSettings()           // general Default Apps page
 *   openDefaultAppsSettings("docx")     // focuses on .docx (Win11 22H2+)
 *
 * Windows doesn't let apps silently claim defaults — the user has to
 * confirm in this Settings page. We just get them there in one click.
 */
export const openDefaultAppsSettings = async (
  ext?: string,
): Promise<void> => {
  if (!isTauri()) {
    console.info("[typex] default-apps settings is desktop-only");
    return;
  }
  await invoke<void>("open_default_apps_settings", {
    typedFilter: ext ?? null,
  });
};
