/**
 * Pure utilities for the Skyforge Arena Live Blender Bridge:
 * - Binary GLB v2 header validation
 * - Safe filename sanitization
 * - Blender 3.6–4.x Python add-on generator (one-click push & auto-sync on save)
 */

export interface GlbValidationResult {
  valid: boolean;
  reason?: string;
  declaredLength?: number;
}

export interface BlenderAddonConfig {
  serverUrl: string;
  sessionId: string;
  token: string;
}

export const MAX_BRIDGE_GLB_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates that a binary payload is a genuine glTF 2.0 Binary (.glb) container.
 * Header layout (12 bytes, little-endian):
 *   0..3 : magic = 0x46546C67 ("glTF")
 *   4..7 : version = 2
 *   8..11: total file length in bytes
 */
export function validateGlbHeader(bytes: Uint8Array): GlbValidationResult {
  if (!bytes || bytes.byteLength < 12) {
    return { valid: false, reason: 'Payload is too small to be a valid .glb file.' };
  }
  if (bytes.byteLength > MAX_BRIDGE_GLB_BYTES) {
    return { valid: false, reason: 'GLB exceeds the 10 MB live bridge limit.' };
  }

  // Magic "glTF" in ASCII: 0x67, 0x6C, 0x54, 0x46
  if (bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) {
    return { valid: false, reason: 'Invalid file signature: expected binary .glb (glTF).' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== 2) {
    return { valid: false, reason: `Unsupported glTF binary version ${version} (expected 2).` };
  }

  const declaredLength = view.getUint32(8, true);
  if (declaredLength < 12 || declaredLength > bytes.byteLength + 4) {
    return { valid: false, reason: 'Corrupted GLB header length.' };
  }

  return { valid: true, declaredLength };
}

/**
 * Strips path separators and unsafe characters from an incoming Blender filename header.
 */
export function sanitizeBlenderFilename(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return 'blender-live-sync.glb';
  }
  const base = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  const trimmed = cleaned.slice(0, 60);
  if (!trimmed) {
    return 'blender-live-sync.glb';
  }
  return trimmed.toLowerCase().endsWith('.glb') ? trimmed : `${trimmed}.glb`;
}

/**
 * Escapes a string safely for inclusion inside a single-line Python double-quoted string literal.
 */
export function sanitizePythonString(value: string): string {
  return value
    .replace(/[\r\n\0]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .slice(0, 512);
}

/**
 * Generates a self-contained Blender 3.6 – 5.x Python add-on (.py) that connects
 * Blender directly to this EIDRATH: The Last Oath instance via authenticated HTTP POST.
 */
export function generateBlenderAddonScript(config: BlenderAddonConfig): string {
  const safeUrl = sanitizePythonString(config.serverUrl.replace(/\/+$/, ''));
  const safeSession = sanitizePythonString(config.sessionId);
  const safeToken = sanitizePythonString(config.token);

  return `bl_info = {
    "name": "EIDRATH Live Blender Bridge",
    "author": "EIDRATH: The Last Oath",
    "version": (2, 0, 0),
    "blender": (3, 6, 0),
    "location": "View3D > Sidebar (N) > EIDRATH",
    "description": "Export and live-sync Blender 3.6-5.x EIDRATH assets (.glb) directly into EIDRATH: The Last Oath.",
    "category": "Import-Export",
}

import os
import tempfile
import urllib.request
import urllib.error
import bpy
from bpy.app.handlers import persistent


class SkyforgeBridgeSettings(bpy.types.PropertyGroup):
    server_url: bpy.props.StringProperty(
        name="Server URL",
        description="EIDRATH Server URL",
        default="${safeUrl}",
    )
    session_id: bpy.props.StringProperty(
        name="Session ID",
        description="Active EIDRATH Live Bridge Session ID",
        default="${safeSession}",
    )
    bridge_token: bpy.props.StringProperty(
        name="Bridge Token",
        description="Temporary EIDRATH Live Bridge Bearer Token",
        default="${safeToken}",
        subtype="PASSWORD",
    )
    export_selected_only: bpy.props.BoolProperty(
        name="Selected Objects Only",
        description="Export only selected meshes/armature instead of the full scene",
        default=False,
    )
    auto_sync_on_save: bpy.props.BoolProperty(
        name="Auto-Sync on Save (Ctrl+S)",
        description="Automatically push .glb to EIDRATH whenever you save this .blend file",
        default=False,
    )
    last_status: bpy.props.StringProperty(
        name="Status",
        default="Ready to sync",
    )


def _push_scene_to_skyforge(context):
    props = context.scene.skyforge_bridge
    base_url = props.server_url.strip().rstrip("/")
    session_id = props.session_id.strip()
    token = props.bridge_token.strip()

    if not base_url or not session_id or not token:
        props.last_status = "Missing URL, Session ID, or Token"
        return False, props.last_status

    blend_name = bpy.path.basename(bpy.data.filepath) if bpy.data.filepath else "blender_hero.blend"
    glb_name = os.path.splitext(blend_name)[0] + ".glb"
    tmp_path = os.path.join(tempfile.gettempdir(), "skyforge_live_export.glb")

    try:
        export_objs = context.selected_objects if props.export_selected_only else context.scene.objects
        has_armature = any(obj.type == "ARMATURE" for obj in export_objs)
        export_kwargs = {
            "filepath": tmp_path,
            "export_format": "GLB",
            "use_selection": props.export_selected_only,
            "export_yup": True,
            "export_apply": not has_armature,
            "export_skins": True,
            "export_animations": True,
        }
        if has_armature:
            rna_props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
            if "export_def_bones" in rna_props:
                export_kwargs["export_def_bones"] = True
            if "export_animation_mode" in rna_props:
                export_kwargs["export_animation_mode"] = "NLA_TRACKS"
        bpy.ops.export_scene.gltf(**export_kwargs)
        with open(tmp_path, "rb") as f:
            payload = f.read()
    except Exception as exc:
        props.last_status = f"GLB export failed: {exc}"
        return False, props.last_status
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    endpoint = f"{base_url}/api/blender-bridge/{session_id}/push"
    req = urllib.request.Request(
        endpoint,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "model/gltf-binary",
            "X-Blender-Filename": glb_name,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if 200 <= resp.status < 300:
                kb = round(len(payload) / 1024, 1)
                props.last_status = f"Synced {glb_name} ({kb} KB)"
                return True, props.last_status
            props.last_status = f"Server returned HTTP {resp.status}"
            return False, props.last_status
    except urllib.error.HTTPError as err:
        props.last_status = f"HTTP {err.code}: check session or token"
        return False, props.last_status
    except Exception as exc:
        props.last_status = f"Connection error: {exc}"
        return False, props.last_status


class SKYFORGE_OT_push_glb(bpy.types.Operator):
    bl_idname = "skyforge.push_glb"
    bl_label = "Push Character to Arena"
    bl_description = "Export as .glb and live-swap Player 1 in Skyforge Arena"

    def execute(self, context):
        ok, msg = _push_scene_to_skyforge(context)
        self.report({"INFO"} if ok else {"ERROR"}, msg)
        return {"FINISHED"} if ok else {"CANCELLED"}


class SKYFORGE_PT_bridge_panel(bpy.types.Panel):
    bl_label = "Skyforge Live Bridge"
    bl_idname = "SKYFORGE_PT_bridge_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Skyforge"

    def draw(self, context):
        layout = self.layout
        props = context.scene.skyforge_bridge

        col = layout.column(align=True)
        col.prop(props, "server_url")
        col.prop(props, "session_id")
        col.prop(props, "bridge_token")

        layout.separator()
        layout.prop(props, "export_selected_only")
        layout.prop(props, "auto_sync_on_save")

        layout.separator()
        row = layout.row()
        row.scale_y = 1.4
        row.operator("skyforge.push_glb", icon="EXPORT")

        box = layout.box()
        box.label(text=props.last_status, icon="INFO")


@persistent
def _on_save_post(_dummy):
    scene = bpy.context.scene
    if scene and hasattr(scene, "skyforge_bridge") and scene.skyforge_bridge.auto_sync_on_save:
        _push_scene_to_skyforge(bpy.context)


CLASSES = (
    SkyforgeBridgeSettings,
    SKYFORGE_OT_push_glb,
    SKYFORGE_PT_bridge_panel,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.skyforge_bridge = bpy.props.PointerProperty(type=SkyforgeBridgeSettings)
    if _on_save_post not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(_on_save_post)


def unregister():
    if _on_save_post in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(_on_save_post)
    if hasattr(bpy.types.Scene, "skyforge_bridge"):
        del bpy.types.Scene.skyforge_bridge
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
`;
}
