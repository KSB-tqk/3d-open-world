// Authored macro layout for the fixed reference map. North is negative Z.
export const WORLD_SIZE = 1000

export const WORLD_MAP = {
  id: 'sunmeadow-reference-map',
  displayName: 'Sunmeadow Valley',
  spawn: { x: 0, z: 260 },
  landmarks: {
    spawn: { x: 0, z: 260 },
    bridge: { x: 0, z: 140 },
    ford: { x: 215, z: 140 },
    village: { x: -20, z: -30 },
    greatTree: { x: -75, z: -95 },
    westFort: { x: -220, z: -155 },
    openField: { x: 180, z: -25 },
    lake: { x: 260, z: -130 },
    forest: { x: 175, z: 165 },
    westCliffs: { x: -300, z: 25 },
    northRidge: { x: 0, z: -450 },
    ruins: { x: -270, z: 275 },
    mountainRange: { startX: -480, endX: 480, z: -458, peaks: 17 },
  },
  routes: {
    mainRoad: [[0,260],[-8,225],[5,190],[0,155],[0,140],[4,105],[-8,58],[-20,-30]],
    fortRoad: [[-20,-30],[-65,-60],[-125,-100],[-175,-130],[-220,-155]],
    eastRoad: [[-20,-30],[45,-35],[105,-48],[165,-75],[220,-103],[260,-130]],
    forestPath: [[0,155],[45,185],[95,205],[145,190],[175,165],[240,195]],
  },
  river: {
    points: [[-500,150],[-400,140],[-300,155],[-190,135],[-80,150],[0,140],[100,150],[210,135],[290,150],[330,100],[350,30],[315,-50],[260,-130],[500,-180]],
    width: 18,
    waterDepth: 5,
  },
  lake: { x: 260, z: -130, radiusX: 68, radiusZ: 48 },
  village: { x: -20, z: -30, houseCount: 8, radius: 60 },
  forests: [
    { id: 'east-forest', x: 175, z: 165, width: 130, depth: 115, columns: 10, rows: 9 },
    { id: 'northwest-wood', x: -250, z: -260, width: 110, depth: 75, columns: 8, rows: 5 },
  ],
  cliffs: { x: -300, z: 25, width: 65, depth: 165, height: 25 },
  fort: { x: -220, z: -155, plateauRadiusX: 55, plateauRadiusZ: 48, plateauHeight: 25 },
  ridge: { z: -455, height: 54, width: 55, peaks: 4 },
  foothills: [
    { x: -300, z: -350, width: 145, depth: 105, height: 38, seed: 12 },
    { x: -70, z: -340, width: 150, depth: 110, height: 32, seed: 28 },
    { x: 165, z: -355, width: 165, depth: 115, height: 40, seed: 44 },
  ],
  mountains: [
    { x: -390, z: -458, width: 225, depth: 190, height: 175, tint: '#7e949a', seed: 2, peaks: [[-.34,-.12,.95,.27],[.18,.08,.76,.32],[.38,-.2,.52,.24]] },
    { x: -145, z: -468, width: 205, depth: 175, height: 155, tint: '#879ca0', seed: 5, peaks: [[-.25,.12,.76,.3],[.18,-.1,1,.29],[.42,.15,.53,.25]] },
    { x: 105, z: -450, width: 245, depth: 205, height: 205, tint: '#748991', seed: 9, peaks: [[-.38,.1,.75,.34],[.02,-.15,1,.31],[.36,.12,.69,.32]] },
    { x: 370, z: -465, width: 245, depth: 185, height: 185, tint: '#a5b6b9', seed: 15, peaks: [[-.35,-.05,.65,.32],[.12,.12,1,.3],[.4,-.12,.72,.28]] },
  ],
  debugLandmarks: ['spawn','bridge','village','greatTree','westFort','forest','lake','northRidge'],
}

export const ZONES = {
  SPAWN_MEADOW: { x: 0, z: 260, radiusX: 90, radiusZ: 72 },
  RIVER: { points: WORLD_MAP.river.points },
  VILLAGE: { x: -20, z: -30, radiusX: 62, radiusZ: 54 },
  WEST_FORT: { x: -220, z: -155, radiusX: 65, radiusZ: 55 },
  OPEN_FIELD: { x: 180, z: -25, radiusX: 105, radiusZ: 100 },
  EAST_FOREST: { x: 175, z: 165, radiusX: 80, radiusZ: 72 },
  LAKE: { x: 260, z: -130, radiusX: 78, radiusZ: 58 },
  WEST_CLIFFS: { x: -300, z: 25, radiusX: 60, radiusZ: 150 },
  NORTH_RIDGE: { x: 0, z: -458, radiusX: 500, radiusZ: 90 },
}
