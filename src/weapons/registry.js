// Keep the weapon data/assets available, but disable all firearm gameplay for now.
export const RIFLE_ENABLED = false

export const WEAPONS = Object.freeze({
  rifle: Object.freeze({
    id: 'rifle',
    name: 'Rifle',
    modelPath: '/models/weapons/rifle.glb',
    type: 'firearm',
    damage: 25,
    fireIntervalMs: 250,
    range: 250,
    automatic: false,
    // Muzzle position uses the source model's local -Z barrel axis; the
    // attachment correction rotates that axis to this world's +Z forward.
    muzzlePosition: Object.freeze([0, 0, -0.99]),
    // GLTFLoader removes the dot from these source node names at runtime.
    attachmentBoneNames: Object.freeze(['FistR', 'Fist.R']),
    // The source rifle's barrel points along Blender +Y. Blender's glTF Y-up
    // conversion makes that local -Z; rotate it to this game's +Z forward.
    defaultAttachment: Object.freeze({
      position: Object.freeze([0, 0, 0]),
      rotation: Object.freeze([0, Math.PI, 0]),
      scale: 1,
    }),
    characterOverrides: Object.freeze({}),
  }),
})

export const getWeapon = id => WEAPONS[id] || null
