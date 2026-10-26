const filenames = [
  'BaseCharacter.gltf', 'BlueSoldier_Female.gltf', 'BlueSoldier_Male.gltf', 'Casual2_Female.gltf',
  'Casual2_Male.gltf', 'Casual3_Female.gltf', 'Casual3_Male.gltf', 'Casual_Bald.gltf', 'Casual_Female.gltf',
  'Casual_Male.gltf', 'Chef_Female.gltf', 'Chef_Hat.gltf', 'Chef_Male.gltf', 'Cow.gltf', 'Cowboy_Female.gltf',
  'Cowboy_Hair.gltf', 'Cowboy_Male.gltf', 'Doctor_Female_Old.gltf', 'Doctor_Female_Young.gltf',
  'Doctor_Male_Old.gltf', 'Doctor_Male_Young.gltf', 'Elf.gltf', 'Goblin_Female.gltf', 'Goblin_Male.gltf',
  'Kimono_Female.gltf', 'Kimono_Male.gltf', 'Knight_Golden_Female.gltf', 'Knight_Golden_Male.gltf',
  'Knight_Male.gltf', 'Ninja_Female.gltf', 'Ninja_Male.gltf', 'Ninja_Male_Hair.gltf', 'Ninja_Sand.gltf',
  'Ninja_Sand_Female.gltf', 'OldClassy_Female.gltf', 'OldClassy_Male.gltf', 'Pirate_Female.gltf',
  'Pirate_Male.gltf', 'Pug.gltf', 'Soldier_Female.gltf', 'Soldier_Male.gltf', 'Suit_Female.gltf',
  'Suit_Male.gltf', 'VikingHelmet.gltf', 'Viking_Female.gltf', 'Viking_Male.gltf', 'Witch.gltf',
  'Wizard.gltf', 'Worker_Female.gltf', 'Worker_Male.gltf',
]

const displayName = filename => filename.replace(/\.gltf$/i, '').replace(/_/g, ' ')

export const CHARACTERS = filenames.map(filename => ({
  id: filename.replace(/\.gltf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  name: displayName(filename),
  model: `/models/characters/${filename}`,
  height: filename === 'Pug.gltf' ? 1.1 : filename === 'Cow.gltf' ? 2.2 : 3.35,
  scale: 1,
  rotationOffset: 0,
  positionOffset: [0, 0, 0],
}))

export const DEFAULT_CHARACTER_ID = 'casual_male'
const warnedCharacterIds = new Set()
export const getCharacter = id => {
  const character = CHARACTERS.find(item => item.id === id)
  if (!character && typeof import.meta.env !== 'undefined' && import.meta.env.DEV && !warnedCharacterIds.has(id)) {
    warnedCharacterIds.add(id)
    console.warn('[CHAR DEBUG] Unknown remote characterId:', id, 'available:', CHARACTERS.map(item => item.id))
  }
  return character || CHARACTERS.find(item => item.id === DEFAULT_CHARACTER_ID)
}
export const isCharacterId = id => CHARACTERS.some(character => character.id === id)
