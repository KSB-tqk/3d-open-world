import { useMemo } from 'react'
import * as THREE from 'three'
import { Billboard, Text } from '@react-three/drei'
import { baseTerrainHeight, riverDistance, terrainHeight } from './terrain.js'
import { WORLD_MAP, WORLD_SEED, WORLD_SIZE } from '../world/worldConfig.js'

const rand = (seed) => { const x = Math.sin(seed * 999.91) * 43758.5453; return x - Math.floor(x) }
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
function distanceToRoute(x,z,route){
  let best=Infinity
  for(let i=0;i<route.length-1;i++){
    const [ax,az]=route[i],[bx,bz]=route[i+1],dx=bx-ax,dz=bz-az
    const t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1)
    best=Math.min(best,Math.hypot(x-ax-dx*t,z-az-dz*t))
  }
  return best
}

function Tree({ x, z, s, color = '#368c52' }) {
  const y = terrainHeight(x, z)
  return <group position={[x, y, z]} scale={s}>
    <mesh castShadow position-y={2}><cylinderGeometry args={[.32, .58, 4, 7]} /><meshStandardMaterial color="#76513b" /></mesh>
    <mesh castShadow position-y={4.8}><coneGeometry args={[2.8, 5.8, 7]} /><meshStandardMaterial color={color} roughness={1} /></mesh>
    <mesh castShadow position-y={6.8}><coneGeometry args={[2, 4.3, 7]} /><meshStandardMaterial color="#58ad68" roughness={1} /></mesh>
  </group>
}

function ForestBatch({ trees }) {
  const meshes = useMemo(() => {
    const entries = [
      { geometry: new THREE.CylinderGeometry(.32, .58, 4, 7), y: 2, color: '#76513b' },
      { geometry: new THREE.ConeGeometry(2.8, 5.8, 7), y: 4.8, colors: ['#286e4e','#347b52','#357f54','#408e58'] },
      { geometry: new THREE.ConeGeometry(2, 4.3, 7), y: 6.8, colors: ['#4b9c5a','#58ad68','#61b873','#50a860'] },
    ]
    return entries.map(entry => {
      const material = new THREE.MeshStandardMaterial({ color: entry.color || '#ffffff', roughness: 1 })
      const mesh = new THREE.InstancedMesh(entry.geometry, material, trees.length)
      const dummy = new THREE.Object3D()
      trees.forEach((tree, i) => {
        dummy.position.set(tree.x, terrainHeight(tree.x, tree.z) + entry.y * tree.s, tree.z)
        dummy.scale.setScalar(tree.s)
        dummy.rotation.set(0, tree.rotation, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        if (entry.colors) mesh.setColorAt(i, new THREE.Color(entry.colors[tree.colorIndex % entry.colors.length]))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      return mesh
    })
  }, [trees])
  return <>{meshes.map((mesh, index) => <primitive key={index} object={mesh} />)}</>
}

function Rock({ x, z, s }) {
  return <mesh castShadow receiveShadow position={[x, terrainHeight(x, z) + .7 * s, z]} scale={[1.4*s,s,1.1*s]} rotation-y={rand(x+z)*3}>
    <dodecahedronGeometry args={[1,0]} /><meshStandardMaterial color="#82958a" roughness={1} />
  </mesh>
}

function createRibbon(points, width, lift = .18) {
  const vertices = [], indices = []
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)]
    const dx = after.x - before.x, dz = after.z - before.z, len = Math.hypot(dx, dz) || 1
    const nx = -dz / len * width / 2, nz = dx / len * width / 2
    for (const side of [-1, 1]) {
      const x = point.x + nx * side, z = point.z + nz * side
      vertices.push(x, terrainHeight(x, z) + lift, z)
    }
    if (i < points.length - 1) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}

function Path() {
  const geometry = useMemo(() => {
    const geometries = Object.entries(WORLD_MAP.routes).map(([routeName,route]) => {
      const curve = new THREE.CatmullRomCurve3(route.map(([x,z]) => new THREE.Vector3(x,0,z)))
      const width=routeName==='mainRoad'?7.5:routeName==='forestPath'?2.8:4
      return createRibbon(curve.getPoints(180), width, .22)
    })
    const merged = new THREE.BufferGeometry()
    const positions=[], indices=[]
    geometries.forEach(g=>{
      const offset=positions.length/3
      positions.push(...g.attributes.position.array)
      for(const index of g.index.array) indices.push(index+offset)
      g.dispose()
    })
    merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));merged.setIndex(indices);merged.computeVertexNormals()
    return merged
  }, [])
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#bd9361" roughness={1} side={THREE.DoubleSide} /></mesh>
}

const HOUSE_VARIANTS={
  cottage:{width:8.5,depth:7,wall:4,roof:2.8,wallColor:'#ead4aa',roofColor:'#a95043',foundation:'#827b68'},
  large:{width:11,depth:9,wall:5,roof:3.5,wallColor:'#dfc39a',roofColor:'#70453a',foundation:'#77766b'},
  shop:{width:12,depth:8.5,wall:4.5,roof:3.2,wallColor:'#ead6b1',roofColor:'#496d75',foundation:'#77766b'},
  inn:{width:13,depth:10,wall:5.2,roof:3.8,wallColor:'#e7cfaa',roofColor:'#9e5142',foundation:'#77766b'},
}

function makeGabledRoof(width,depth,rise){
  const hw=(width+1.25)/2,hd=(depth+1.1)/2
  const positions=[-hw,0,-hd, hw,0,-hd, hw,0,hd, -hw,0,hd, 0,rise,-hd, 0,rise,hd]
  const indices=[0,3,5,0,5,4,4,5,2,4,2,1,0,4,1,3,2,5]
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g
}

function House({house}){
  const config=HOUSE_VARIANTS[house.type]
  const roof=useMemo(()=>makeGabledRoof(config.width,config.depth,config.roof),[config])
  const windowXs=[-config.width*.29,config.width*.29]
  return <group position={[house.x,terrainHeight(house.x,house.z),house.z]} rotation-y={house.rotation}>
    <mesh castShadow receiveShadow position-y={.3}><boxGeometry args={[config.width+.55,.6,config.depth+.55]}/><meshStandardMaterial color={config.foundation} roughness={1}/></mesh>
    <mesh castShadow receiveShadow position-y={.6+config.wall/2}><boxGeometry args={[config.width,config.wall,config.depth]}/><meshStandardMaterial color={config.wallColor} roughness={.9}/></mesh>
    <mesh castShadow position-y={.6+config.wall} geometry={roof} dispose={null}><meshStandardMaterial color={config.roofColor} roughness={.95} side={THREE.DoubleSide}/></mesh>
    <mesh castShadow position={[0,1.5,config.depth/2+.1]}><boxGeometry args={[1.45,2.4,.18]}/><meshStandardMaterial color="#634535"/></mesh>
    {windowXs.map((wx,i)=><group key={i} position={[wx,2.55,config.depth/2+.12]}><mesh><boxGeometry args={[1.5,1.5,.12]}/><meshStandardMaterial color="#79543b"/></mesh><mesh position-z={.075}><boxGeometry args={[1.12,1.12,.04]}/><meshStandardMaterial color="#83c8d0" emissive="#315b64" emissiveIntensity={.15}/></mesh><mesh position={[0,0,.11]}><boxGeometry args={[.09,1.2,.06]}/><meshStandardMaterial color="#f2d6a7"/></mesh></group>)}
    <mesh castShadow position={[-config.width*.3,.6+config.wall+.85,-config.depth*.22]}><boxGeometry args={[1.5,config.roof+2,1.7]}/><meshStandardMaterial color="#7d6d5c"/></mesh>
    <mesh position={[-config.width*.3,.6+config.wall+config.roof+1,-config.depth*.22]}><boxGeometry args={[1.8,.25,2]}/><meshStandardMaterial color="#554b43"/></mesh>
    {house.type==='large'||house.type==='inn'?<group>
      {[-config.width*.42,config.width*.42].map((x,i)=><mesh key={i} position={[x,2.6,config.depth/2+.16]}><boxGeometry args={[.22,4.2,.22]}/><meshStandardMaterial color="#694936"/></mesh>)}
      <mesh position={[0,.72,config.depth/2+.16]}><boxGeometry args={[config.width*.88,.2,.22]}/><meshStandardMaterial color="#694936"/></mesh>
    </group>:null}
    {house.type==='shop'?<group position={[config.width/2+2,0,0]}>
      <mesh castShadow position-y={2}><boxGeometry args={[4,4,config.depth]}/><meshStandardMaterial color="#ceb38d"/></mesh>
      <mesh castShadow position={[0,4.5,0]} rotation-z={-.12}><boxGeometry args={[5,.35,config.depth+1]}/><meshStandardMaterial color="#d7b36e"/></mesh>
      {[-2,2].map((x,i)=><mesh key={i} position={[x,2,config.depth/2]}><cylinderGeometry args={[.12,.12,4,6]}/><meshStandardMaterial color="#765039"/></mesh>)}
      <mesh castShadow position={[2,.75,config.depth/2+1]}><cylinderGeometry args={[.55,.62,1.5,9]}/><meshStandardMaterial color="#855638"/></mesh>
      <mesh castShadow position={[-1,.6,config.depth/2+1]}><boxGeometry args={[1.1,1.2,1.1]}/><meshStandardMaterial color="#a2784e"/></mesh>
    </group>:null}
  </group>
}

function Water() {
  const geometry = useMemo(() => {
    const curve=new THREE.CatmullRomCurve3(WORLD_MAP.river.points.map(([x,z])=>new THREE.Vector3(x,0,z)))
    const points=curve.getPoints(260),vertices=[],indices=[]
    points.forEach((p,i)=>{
      const before=points[Math.max(i-1,0)],after=points[Math.min(i+1,points.length-1)]
      const dx=after.x-before.x,dz=after.z-before.z,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len
      for(const side of [-1,1]) { const x=p.x+nx*WORLD_MAP.river.width*.5*side,z=p.z+nz*WORLD_MAP.river.width*.5*side;vertices.push(x,baseTerrainHeight(x,z)-2.5,z) }
      if(i<points.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}
    })
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g
  }, [])
  const lake = useMemo(()=>{
    const g=new THREE.CircleGeometry(1,64),p=g.attributes.position
    for(let i=0;i<p.count;i++){const x=WORLD_MAP.lake.x+p.getX(i)*WORLD_MAP.lake.radiusX,z=WORLD_MAP.lake.z+p.getY(i)*WORLD_MAP.lake.radiusZ;p.setXYZ(i,x,baseTerrainHeight(WORLD_MAP.lake.x,WORLD_MAP.lake.z)-2.5,z)}
    g.computeVertexNormals();return g
  },[])
  return <><mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#50c6d5" roughness={.3} metalness={.02} side={THREE.DoubleSide} /></mesh><mesh geometry={lake} receiveShadow><meshStandardMaterial color="#4dbbd1" roughness={.28} metalness={.02} side={THREE.DoubleSide}/></mesh></>
}

function Bridge() {
  const {x,z}=WORLD_MAP.landmarks.bridge,y=terrainHeight(x,z)+.22
  return <group position={[0,0,0]}>
    <mesh castShadow receiveShadow position={[x,y,z]}><boxGeometry args={[8,.45,27]} /><meshStandardMaterial color="#98704c" roughness={1} /></mesh>
    {[-4,4].map((offset,i)=><mesh key={i} castShadow position={[x+offset,y+1,z]}><boxGeometry args={[.42,1.25,27]} /><meshStandardMaterial color="#795539" /></mesh>)}
    {[-11,-5,5,11].map((offset,i)=><mesh key={`post${i}`} castShadow position={[x-4,y+1,z+offset]}><boxGeometry args={[.5,1.4,.5]} /><meshStandardMaterial color="#795539" /></mesh>)}
  </group>
}

function Village() {
  const houses = useMemo(()=>{
    const layout=[
      [-31,-18,'cottage',-.35],[-10,-27,'large',.1],[14,-24,'cottage',-.25],[33,-8,'shop',0],
      [-34,9,'cottage',.35],[-10,14,'inn',-.15],[17,15,'cottage',.25],[0,38,'large',.1],
    ]
    return layout.slice(0,WORLD_MAP.village.houseCount).map(([dx,dz,type,rotation])=>({x:WORLD_MAP.village.x+dx,z:WORLD_MAP.village.z+dz,type,rotation}))
  },[])
  const centerY=terrainHeight(WORLD_MAP.village.x,WORLD_MAP.village.z)
  const gardenX=WORLD_MAP.village.x+55,gardenZ=WORLD_MAP.village.z+42
  return <group>
  <mesh position={[WORLD_MAP.village.x,centerY+.08,WORLD_MAP.village.z]} rotation-x={-Math.PI/2}><circleGeometry args={[16,32]}/><meshStandardMaterial color="#c9a576" roughness={1}/></mesh>
  <VillageWell position={[WORLD_MAP.village.x,centerY,WORLD_MAP.village.z]}/>
  {houses.map((house,i)=><House key={i} house={house}/>)}
  <Watchtower position={[WORLD_MAP.village.x+47,terrainHeight(WORLD_MAP.village.x+47,WORLD_MAP.village.z+4),WORLD_MAP.village.z+4]}/>
  <group position={[gardenX,terrainHeight(gardenX,gardenZ),gardenZ]}>
    <mesh receiveShadow position-y={.08}><boxGeometry args={[22,.16,13]}/><meshStandardMaterial color="#745638"/></mesh>
    {Array.from({length:5},(_,i)=><mesh key={i} position={[-8+i*4,.45,0]}><boxGeometry args={[.45,.55,8]}/><meshStandardMaterial color="#4d8c45"/></mesh>)}
    {[-11,11].map((x,i)=><mesh key={`post${i}`} position={[x,.7,0]}><boxGeometry args={[.35,1.4,14]}/><meshStandardMaterial color="#795539"/></mesh>)}
    {[-6,0,6].map((z,i)=><mesh key={`rail${i}`} position={[0,1.05,z]}><boxGeometry args={[22,.22,.22]}/><meshStandardMaterial color="#795539"/></mesh>)}
  </group>
  </group>
}

function VillageWell({position}){
  return <group position={position}>
    <mesh castShadow position-y={.55}><cylinderGeometry args={[1.8,2.1,1.1,10]}/><meshStandardMaterial color="#969181"/></mesh>
    <mesh position-y={1.12}><cylinderGeometry args={[1.35,1.35,.12,10]}/><meshStandardMaterial color="#4b8790"/></mesh>
    {[-1.65,1.65].map((x,i)=><mesh key={i} position={[x,2.25,0]}><cylinderGeometry args={[.12,.16,2.4,6]}/><meshStandardMaterial color="#775137"/></mesh>)}
    <mesh position-y={3.55}><boxGeometry args={[4,.25,3.5]}/><meshStandardMaterial color="#81503e"/></mesh>
  </group>
}

function Watchtower({position}){
  const roof=useMemo(()=>makeGabledRoof(8,8,3),[])
  return <group position={position}>
    {[[-2.5,-2.5],[2.5,-2.5],[-2.5,2.5],[2.5,2.5]].map(([x,z],i)=><mesh key={i} castShadow position={[x,5,z]}><boxGeometry args={[.55,10,.55]}/><meshStandardMaterial color="#795238"/></mesh>)}
    <mesh castShadow position-y={9}><boxGeometry args={[7,.8,7]}/><meshStandardMaterial color="#745039"/></mesh>
    <mesh castShadow position-y={9.4} geometry={roof} dispose={null}><meshStandardMaterial color="#9a4a3f" side={THREE.DoubleSide}/></mesh>
  </group>
}

function GreatTree(){
  const {x,z}=WORLD_MAP.landmarks.greatTree,y=terrainHeight(x,z)
  return <group position={[x,y,z]}>
    <mesh castShadow><cylinderGeometry args={[2.4,3.8,18,10]} /><meshStandardMaterial color="#745038" /></mesh>
    <mesh castShadow position={[0,16,0]}><sphereGeometry args={[13,12,10]} /><meshStandardMaterial color="#31874b" roughness={1} /></mesh>
    <mesh castShadow position={[-8,12,3]}><sphereGeometry args={[8,10,8]} /><meshStandardMaterial color="#48a957" roughness={1} /></mesh>
    <mesh castShadow position={[8,13,-3]}><sphereGeometry args={[8,10,8]} /><meshStandardMaterial color="#3a984e" roughness={1} /></mesh>
  </group>
}

function WestFort(){
  const {x,z}=WORLD_MAP.landmarks.westFort,y=terrainHeight(x,z)
  return <group position={[x,y,z]}>
    <mesh receiveShadow position-y={.5}><cylinderGeometry args={[43,46,1,12]} /><meshStandardMaterial color="#9a805a" /></mesh>
    {Array.from({length:12},(_,i)=>{if(i===3)return null;const a=i*Math.PI/6,px=Math.cos(a)*40,pz=Math.sin(a)*40;return <mesh key={i} castShadow position={[px,3,pz]} rotation-y={-a}><boxGeometry args={[2,5,13]} /><meshStandardMaterial color="#79533b" /></mesh>})}
    {[[-32,-32],[32,-32],[-32,32],[32,32]].map(([tx,tz],i)=><group key={i} position={[tx,0,tz]}><mesh castShadow position-y={6}><boxGeometry args={[5,12,5]} /><meshStandardMaterial color="#79533b" /></mesh><mesh castShadow position-y={13}><coneGeometry args={[4.6,5,4]} /><meshStandardMaterial color="#9a5140" /></mesh></group>)}
    {[-6,6].map((gx,i)=><mesh key={i} castShadow position={[gx,4,39]}><boxGeometry args={[2,8,2]} /><meshStandardMaterial color="#755039" /></mesh>)}
    <mesh castShadow position={[0,8,39]}><boxGeometry args={[14,1.5,2]} /><meshStandardMaterial color="#755039" /></mesh>
  </group>
}

function DebugMarkers(){
  const labels={spawn:'SPAWN MEADOW',bridge:'MAIN BRIDGE',ford:'FORD',village:'VILLAGE',greatTree:'GREAT TREE',westFort:'WEST FORT',forest:'EAST FOREST',openField:'OPEN FIELD',lake:'LAKE',northRidge:'NORTH RIDGE'}
  const overlays=useMemo(()=>{
    const lines=[]
    const addLine=(points,color)=>{
      const geometry=new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,terrainHeight(x,z)+.42,z)))
      const line=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color,depthTest:false}))
      line.renderOrder=5
      lines.push(line)
    }
    WORLD_MAP.forests.forEach(zone=>addLine([
      [zone.x-zone.width/2,zone.z-zone.depth/2],[zone.x+zone.width/2,zone.z-zone.depth/2],
      [zone.x+zone.width/2,zone.z+zone.depth/2],[zone.x-zone.width/2,zone.z+zone.depth/2],
    ],'#2e6840'))
    WORLD_MAP.clearings.forEach(zone=>addLine(Array.from({length:48},(_,i)=>{
      const angle=i/48*Math.PI*2
      return [zone.x+Math.cos(angle)*zone.radiusX,zone.z+Math.sin(angle)*zone.radiusZ]
    }),'#f1d77a'))
    return lines
  },[])
  const controlPoints=Object.values(WORLD_MAP.routes).flatMap(route=>route)
  return <>
    {overlays.map((line,index)=><primitive key={`overlay-${index}`} object={line}/>) }
    {controlPoints.map(([x,z],index)=><mesh key={`route-point-${index}`} position={[x,terrainHeight(x,z)+.9,z]}><sphereGeometry args={[.65,6,5]}/><meshBasicMaterial color="#e8ae58" depthTest={false}/></mesh>)}
    {WORLD_MAP.debugLandmarks.map(key=>{const p=WORLD_MAP.landmarks[key];return <group key={key} position={[p.x,terrainHeight(p.x,p.z)+10,p.z]}><mesh><sphereGeometry args={[1.4,8,6]}/><meshBasicMaterial color="#fff26a" depthTest={false}/></mesh><Billboard><Text fontSize={4} outlineWidth={.3} outlineColor="#17232a" color="white" anchorX="center" anchorY="middle">{labels[key]}</Text></Billboard></group>})}
  </>
}

function Ruins() {
  const {x,z}=WORLD_MAP.landmarks.ruins, y=terrainHeight(x,z)
  return <group position={[x,y,z]}>
    {[[-5,0],[5,0],[-5,-8],[5,-8]].map(([x,z],i)=><mesh key={i} castShadow position={[x,3,z]}><boxGeometry args={[1.6,6,1.6]} /><meshStandardMaterial color="#a99d82" /></mesh>)}
    <mesh castShadow position={[0,6,-8]}><boxGeometry args={[12,1.5,1.8]} /><meshStandardMaterial color="#b7a98b" /></mesh>
  </group>
}

function Flowers() {
  const batches = useMemo(()=>['#fff3be','#f49ab2','#b9a7f5'].map((color,kind)=>{
    const positions=[]
    for(let i=0;i<420;i++) {
      const x=(rand(i*3+kind*900)-.5)*(WORLD_SIZE-28), z=(rand(i*7+kind*1200)-.5)*(WORLD_SIZE-28)
      const insideForest=WORLD_MAP.forests.some(zone=>Math.abs(x-zone.x)<zone.width*.52&&Math.abs(z-zone.z)<zone.depth*.52)
      const inOpenField=Math.hypot((x-WORLD_MAP.landmarks.openField.x)/105,(z-WORLD_MAP.landmarks.openField.z)/100)<1
      const inClearing=WORLD_MAP.clearings.some(c=>Math.hypot((x-c.x)/c.radiusX,(z-c.z)/c.radiusZ)<1)
      if(insideForest || inClearing || (inOpenField&&rand(i+kind*200)>0.12) || Math.hypot(x-WORLD_MAP.spawn.x,z-WORLD_MAP.spawn.z)<40 || Math.hypot(x-WORLD_MAP.village.x,z-WORLD_MAP.village.z)<WORLD_MAP.village.radius || riverDistance(x,z)<WORLD_MAP.river.width*.72) continue
      positions.push([x,terrainHeight(x,z)+.5,z, .65+rand(i+kind*77)*.8])
    }
    return {color,positions}
  }),[])
  return <>{batches.map((b,k)=><FlowerBatch key={k} batch={b} />)}</>
}

function FlowerBatch({batch}) {
  const mesh = useMemo(()=>{
    const geometry=new THREE.SphereGeometry(.38,5,4), material=new THREE.MeshStandardMaterial({color:batch.color,roughness:.8})
    const instanced=new THREE.InstancedMesh(geometry,material,batch.positions.length), dummy=new THREE.Object3D()
    batch.positions.forEach(([x,y,z,s],i)=>{dummy.position.set(x,y,z);dummy.scale.setScalar(s);dummy.updateMatrix();instanced.setMatrixAt(i,dummy.matrix)})
    instanced.instanceMatrix.needsUpdate=true; return instanced
  },[batch])
  return <primitive object={mesh} />
}

function makeMountainGeometry(formation, foothill=false){
  const nx=24,nz=18,positions=[],colors=[],indices=[]
  const grass=new THREE.Color('#627e51'), stone=new THREE.Color(formation.tint||'#74868d'), snow=new THREE.Color('#d4dcda')
  for(let iz=0;iz<=nz;iz++) for(let ix=0;ix<=nx;ix++){
    const u=ix/nx*2-1,v=iz/nz*2-1,edge=Math.max(Math.abs(u),Math.abs(v))
    const envelope=Math.pow(Math.max(0,1-edge*edge),1.5)
    let relief=.12*Math.exp(-(u*u+v*v)*2)
    const peaks=formation.peaks||[[-.3,-.05,.7,.48],[.25,.12,.85,.44]]
    for(const [px,pz,strength,spread] of peaks){const d=((u-px)**2+(v-pz)**2*.8)/(spread*spread);relief+=strength*Math.exp(-d*2.8)}
    const ripple=(Math.sin((u+formation.seed)*11)*Math.cos((v-formation.seed)*9))*.025
    const h=Math.max(0,(relief+ripple)*envelope)
    positions.push(u*formation.width/2,h*formation.height,v*formation.depth/2)
    const altitude=h*formation.height/formation.height
    const color=grass.clone().lerp(stone,THREE.MathUtils.smoothstep(altitude,.12,.5))
    if(!foothill)color.lerp(snow,THREE.MathUtils.smoothstep(altitude,.78,1.02)*.72)
    colors.push(color.r,color.g,color.b)
  }
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const a=z*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1
    if((x+z)%2){indices.push(a,b,c,b,d,c)}else{indices.push(a,b,d,a,d,c)}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g
}

function MountainMass({formation,foothill=false}){
  const geometry=useMemo(()=>makeMountainGeometry(formation,foothill),[formation,foothill])
  return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial vertexColors flatShading roughness={1}/></mesh>
}

function MountainLayers(){
  return <>
    {WORLD_MAP.foothills.map((formation,i)=><group key={`hill-${i}`} position={[formation.x,baseTerrainHeight(formation.x,formation.z),formation.z]}><MountainMass formation={formation} foothill/></group>)}
    {WORLD_MAP.mountains.map((formation,i)=><group key={`mountain-${i}`} position={[formation.x,baseTerrainHeight(formation.x,formation.z),formation.z]}><MountainMass formation={formation}/></group>)}
  </>
}

function WestCliffs(){
  const {x,z,width,depth}=WORLD_MAP.cliffs
  return <group>{Array.from({length:14},(_,i)=>{const px=x-width/2+(i%2)*12,pz=z-depth/2+Math.floor(i/2)*(depth/7);const h=18+rand(i+444)*22;return <group key={i} position={[px,terrainHeight(px,pz),pz]}><mesh castShadow><boxGeometry args={[16+rand(i+555)*12,h,35+rand(i+666)*18]} /><meshStandardMaterial color={i%2?'#89918a':'#9c9a89'} flatShading /></mesh><mesh castShadow position={[0,h/2+1,0]}><dodecahedronGeometry args={[11,0]} /><meshStandardMaterial color="#8f9285" flatShading /></mesh></group>})}
    <mesh position={[x+24,terrainHeight(x+24,z)-8,z+42]} rotation-z={Math.PI/2}><planeGeometry args={[42,7]} /><meshStandardMaterial color="#54c4db" transparent opacity={.8} side={THREE.DoubleSide} /></mesh>
  </group>
}

function Ford(){
  const {x,z}=WORLD_MAP.landmarks.ford,y=baseTerrainHeight(x,z)-1.2
  return <group>{Array.from({length:7},(_,i)=><mesh key={i} castShadow receiveShadow position={[x-12+i*4,y,z+Math.sin(i*.8)*3]} rotation-y={rand(i+600)*2}><dodecahedronGeometry args={[1.8+rand(i+601)*.5,0]} /><meshStandardMaterial color="#aaa994" roughness={1} /></mesh>)}</group>
}

export default function Scenery({ debugMap = false }){
  const items=useMemo(()=>[
    [-86,182,1.1],[78,200,.9],[145,215,1.2],[-150,208,.85],[95,275,1.05],
    [82,-126,.85],[65,-91,.9],[152,-110,1.1],[258,-214,1.2],[273,-198,.9],
    [164,-151,1.2],[275,-72,1.1],[268,4,.8],[-158,34,1.25],[-234,82,1.1],
    [40,214,1.2],[85,266,1.05],[128,234,.9],[-80,192,1.3],[-115,176,1.05],
  ].map(([x,z,s],i)=>({x,z,s,rock:i%5===2})),[])
  const forest=useMemo(()=>WORLD_MAP.forests.flatMap((zone,zoneIndex)=>{
    const random=seededRandom(WORLD_SEED+zone.seed)
    return Array.from({length:zone.columns*zone.rows},(_,i)=>{
      const col=i%zone.columns,row=Math.floor(i/zone.columns)
      const x=zone.x-zone.width/2+(col+.5+(random()-.5)*.48)*zone.width/zone.columns
      const z=zone.z-zone.depth/2+(row+.5+(random()-.5)*.48)*zone.depth/zone.rows
      const inClearing=WORLD_MAP.clearings.some(c=>Math.hypot((x-c.x)/c.radiusX,(z-c.z)/c.radiusZ)<1)
      const nearRoad=Object.values(WORLD_MAP.routes).some(route=>distanceToRoute(x,z,route)<(route===WORLD_MAP.routes.forestPath?8:6))
      const clearOfStructures=Math.hypot(x-WORLD_MAP.landmarks.westFort.x,z-WORLD_MAP.landmarks.westFort.z)>58
      if(random()>zone.density || inClearing || nearRoad || !clearOfStructures || riverDistance(x,z)<WORLD_MAP.river.width*.85 || Math.abs(x)>WORLD_SIZE/2-12 || Math.abs(z)>WORLD_SIZE/2-12) return null
      return {x,z,s:1.05+random()*.75,rotation:random()*Math.PI*2,colorIndex:Math.floor(random()*4),zoneIndex}
    }).filter(Boolean)
  }),[])
  return <><MountainLayers/><WestCliffs/><Water/><Path/><Bridge/><Ford/><Village/><GreatTree/><WestFort/><Ruins/><Flowers/>{items.map((o,i)=>o.rock?<Rock key={i}{...o}/>:<Tree key={i}{...o}/>)}<ForestBatch trees={forest}/>{debugMap&&<DebugMarkers/>}</>
}
