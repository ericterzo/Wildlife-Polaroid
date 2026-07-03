// Renders a frontal portrait of every species for the cheat gallery.
// Portraits are generated once with a throwaway renderer and cached.
import * as THREE from 'three';
import { SPECIES } from './animals';

export interface Portrait {
  id: string;
  name: string;
  dataUrl: string;
}

let cache: Portrait[] | null = null;

export function generatePortraits(): Portrait[] {
  if (cache) return cache;

  const size = 240;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dcedf5');
  scene.add(new THREE.HemisphereLight('#e8f4fb', '#6b7a55', 1.1));
  const sun = new THREE.DirectionalLight('#fff0d8', 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 24),
    new THREE.MeshLambertMaterial({ color: '#7ba656' })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const sphereSize = new THREE.Vector3();

  const out: Portrait[] = [];
  for (const def of SPECIES) {
    const rig = def.build();
    rig.group.scale.setScalar(def.baseScale);
    rig.group.rotation.y = 0.5; // slight three-quarter turn, facing the camera
    if (def.aquatic) rig.group.position.y = 0.55; // fish get lifted out of the "water"
    scene.add(rig.group);

    box.setFromObject(rig.group);
    box.getCenter(center);
    box.getSize(sphereSize);
    const dim = Math.max(sphereSize.x, sphereSize.y, sphereSize.z);
    const dist = dim * 1.75 + 0.4;
    camera.position.set(center.x + dist * 0.28, center.y + dim * 0.32, center.z + dist);
    camera.lookAt(center);

    renderer.render(scene, camera);
    out.push({ id: def.id, name: def.name, dataUrl: renderer.domElement.toDataURL('image/jpeg', 0.85) });
    scene.remove(rig.group);
  }

  renderer.dispose();
  cache = out;
  return out;
}
