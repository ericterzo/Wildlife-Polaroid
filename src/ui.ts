import { PhotoRecord, captionFor } from './photo';
import { SPECIES } from './animals';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const PHOTOS_PER_PAGE = 6;

export interface UICallbacks {
  onNewGame: (seed: number) => void;
  onContinue: () => void;
  onLoadFile: (file: File) => void;
  onResume: () => void;
  onSave: () => void;
  onQuit: () => void;
  onCloseBook: () => void;
}

export class UI {
  private bookPage = 0;
  private bookRecords: PhotoRecord[] = [];

  constructor(private cb: UICallbacks) {
    $('btn-new').addEventListener('click', () => {
      const raw = $<HTMLInputElement>('seed-input').value.trim();
      let seed: number;
      if (raw.length > 0) {
        seed = Number(raw);
        if (!Number.isFinite(seed)) {
          // hash a text seed
          seed = 0;
          for (let i = 0; i < raw.length; i++) seed = (Math.imul(seed, 31) + raw.charCodeAt(i)) | 0;
        }
      } else {
        seed = (Math.random() * 0xffffffff) | 0;
      }
      cb.onNewGame(seed | 0);
    });
    $('btn-continue').addEventListener('click', () => cb.onContinue());
    const fileInput = $<HTMLInputElement>('loadfile');
    const openPicker = () => {
      fileInput.value = '';
      fileInput.click();
    };
    $('btn-load').addEventListener('click', openPicker);
    $('btn-load2').addEventListener('click', openPicker);
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) cb.onLoadFile(fileInput.files[0]);
    });
    $('btn-resume').addEventListener('click', () => cb.onResume());
    $('btn-save').addEventListener('click', () => cb.onSave());
    $('btn-quit').addEventListener('click', () => cb.onQuit());
    $('book-prev').addEventListener('click', () => this.flipBook(-1));
    $('book-next').addEventListener('click', () => this.flipBook(1));
    $('book-close').addEventListener('click', () => cb.onCloseBook());

    // Once a one-shot animation finishes, park the element for good —
    // otherwise hiding and re-showing the HUD (pause menus) can replay it.
    $('toast').addEventListener('animationend', () => $('toast').classList.add('hidden'));
    $('flash').addEventListener('animationend', () => $('flash').classList.remove('go'));
  }

  // ------------------------------------------------------------- screens

  showTitle(hasAutosave: boolean) {
    $('title').classList.remove('hidden');
    $('btn-continue').classList.toggle('hidden', !hasAutosave);
    $('pause').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('book').classList.add('hidden');
    this.titleStatus('');
  }

  titleStatus(msg: string) {
    $('title-status').textContent = msg;
  }

  showPlaying() {
    $('title').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('book').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  showPause(stats: string) {
    $('pause-stats').textContent = stats;
    $('pause').classList.remove('hidden');
    $('hud').classList.add('hidden');
  }

  hidePause() {
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  setViewfinder(on: boolean) {
    $('viewfinder').classList.toggle('hidden', !on);
  }

  setScore(photoCount: number, speciesCount: number, points: number, day: number) {
    $('score').textContent = `Day ${day} · ${speciesCount}/${SPECIES.length} species · ${points} pts`;
  }

  toast(msg: string) {
    const el = $('toast');
    el.classList.add('hidden');
    // restart the CSS animation
    void el.offsetWidth;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  flash() {
    const el = $('flash');
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  /** The polaroid that ejects and develops on screen. Lasts `seconds`. */
  develop(dataUrl: string, seconds = 2.6) {
    const holder = $('develop');
    holder.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'dev-wrap';
    wrap.style.setProperty('--dev-time', `${seconds}s`);
    wrap.addEventListener('animationend', (e) => {
      // pin each finished animation so a HUD hide/show can't replay it
      if (e.pseudoElement === '::after') wrap.classList.add('developed');
      else wrap.classList.add('ejected');
    });
    const img = document.createElement('img');
    img.src = dataUrl;
    wrap.appendChild(img);
    holder.appendChild(wrap);
    setTimeout(() => {
      if (holder.firstChild === wrap) holder.innerHTML = '';
    }, (seconds + 1.6) * 1000);
  }

  // ----------------------------------------------------------- photobook

  get bookOpen(): boolean {
    return !$('book').classList.contains('hidden');
  }

  openBook(records: PhotoRecord[]) {
    this.bookRecords = records;
    this.bookPage = 0;
    $('book').classList.remove('hidden');
    $('hud').classList.add('hidden');
    this.renderBook();
  }

  closeBook() {
    $('book').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  flipBook(dir: number) {
    const total = this.bookPageCount();
    this.bookPage = Math.min(total - 1, Math.max(0, this.bookPage + dir));
    this.renderBook();
  }

  private bookPageCount(): number {
    return Math.max(1, Math.ceil(this.bookRecords.length / PHOTOS_PER_PAGE)) + 1; // +1 checklist page
  }

  private renderBook() {
    const pages = $('book-pages');
    const total = this.bookPageCount();
    const isChecklist = this.bookPage === total - 1;
    pages.innerHTML = '';

    const totalPts = this.bookRecords.reduce((s, r) => s + r.points, 0);
    $('book-progress').textContent = `${this.bookRecords.length}/${SPECIES.length} species · ${totalPts} pts`;
    $('book-pageno').textContent = isChecklist ? 'index' : `page ${this.bookPage + 1} / ${total - 1}`;

    if (isChecklist) {
      const wrap = document.createElement('div');
      wrap.className = 'checklist';
      const title = document.createElement('div');
      title.className = 'checklist-title';
      title.textContent = '— Field Index —';
      wrap.appendChild(title);
      const byId = new Map(this.bookRecords.map((r) => [r.species, r]));
      for (const s of SPECIES) {
        const rec = byId.get(s.id);
        const row = document.createElement('div');
        row.className = `check-item ${rec ? 'found' : 'missing'}`;
        const name = document.createElement('span');
        name.textContent = rec ? `✓ ${s.name}` : `· ${'?'.repeat(Math.min(12, s.name.length))}`;
        const pts = document.createElement('span');
        pts.className = 'pts';
        pts.textContent = rec ? `${'★'.repeat(rec.stars)} ${rec.points} pts` : '';
        row.append(name, pts);
        wrap.appendChild(row);
      }
      pages.appendChild(wrap);
      return;
    }

    const slice = this.bookRecords.slice(this.bookPage * PHOTOS_PER_PAGE, (this.bookPage + 1) * PHOTOS_PER_PAGE);
    if (slice.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'book-empty';
      empty.textContent = 'No photos yet — go find something with a heartbeat.';
      pages.appendChild(empty);
      return;
    }
    slice.forEach((r, i) => {
      const card = document.createElement('div');
      card.className = 'polaroid';
      card.style.setProperty('--tilt', `${((r.order * 7 + i * 13) % 9) - 4}deg`);
      const pin = document.createElement('div');
      pin.className = 'pin';
      const img = document.createElement('img');
      img.src = r.dataUrl;
      img.alt = captionFor(r).main;
      img.title = `#${r.order} — ${captionFor(r).main}`;
      card.append(pin, img);
      pages.appendChild(card);
    });
  }
}
