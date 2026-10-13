import * as React from 'react';
import {createRoot} from 'react-dom/client';
import DiscCascadeCarousel, {type DiscCascadeItem} from './ui/disc-cascade-carousel';

type Track = {id: string; title: string; artist: string; album: string; source: string; duration?: number};
type Model = {
    library: Track[]; queue: Track[]; current: Track | null;
    libraryVisible: boolean; popupOpen: boolean; paused: boolean;
    shuffle: boolean; repeat: string; favorite: boolean;
    position: number; duration: number; volume: number; status: string;
};
type Actions = {
    playLibrary: (id: string) => void; playQueue: (id: string) => void;
    togglePlay: () => void; previous: () => void; next: () => void;
    shuffle: () => void; repeat: () => void; favorite: () => void;
    seek: (percent: number) => void; volume: (percent: number) => void;
};
const time = (seconds: number) => Number.isFinite(seconds) && seconds >= 0
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
const palettes: [string, string, string][] = [
    ['#e9c3ca', '#8e3a50', '#f0dfae'], ['#253d4e', '#a3ced4', '#f4b8a4'],
    ['#eed08e', '#db6449', '#4a3851'], ['#b8c5b0', '#325e50', '#eee4c9']
];
function discItems(tracks: Track[]): DiscCascadeItem[] {
    return tracks.map(track => {
        const color = [...track.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
        return {
            title: track.title, palette: palettes[color],
            pattern: (['sunburst', 'horizon', 'rings', 'mosaic'] as const)[color],
            labelStyle: 'block', fine: `${track.artist} · ${track.album || 'Your music'}`,
            credits: [{label: 'Artist', value: track.artist}, {label: 'Collection', value: track.album || 'Your music'},
                {label: 'Length', value: track.source === 'radio' ? 'Live radio' : track.duration ? time(track.duration) : 'Audio track'}]
        };
    });
}
function Icon({name}: {name: string}) {
    return <svg aria-hidden="true"><use href={`static/icons.svg#${name}`}/></svg>;
}
const Discs = React.memo(function Discs({tracks, current, paused, popup, onPlay}: {
    tracks: Track[]; current: Track | null; paused: boolean; popup?: boolean; onPlay: (id: string) => void
}) {
    const [selectedId, setSelectedId] = React.useState(current?.id || tracks[0]?.id);
    // New playback follows the selected song; browsing alone never starts audio.
    React.useEffect(() => { if (current && tracks.some(track => track.id === current.id)) setSelectedId(current.id); }, [current?.id]);
    const index = Math.max(0, tracks.findIndex(track => track.id === selectedId));
    const selected = tracks[index];
    const items = React.useMemo(() => discItems(tracks), [tracks]);
    if (!tracks.length) return null;
    return <div className={`music-discs ${popup ? 'popup-discs' : 'library-discs'}`}>
        <DiscCascadeCarousel
            items={items} index={index} defaultIndex={0}
            onIndexChange={i => setSelectedId(tracks[i]?.id)}
            onSelect={(_, i) => onPlay(tracks[i].id)}
            height={popup ? 'clamp(290px, 52svh, 560px)' : 'clamp(390px, 52svh, 540px)'}
            discSize="clamp(175px, 29cqw, 320px)"
            brand="Music." indexLabel="Tracks" reviews={false}
            color="#ecebe7" background="radial-gradient(120% 90% at 50% 40%, #242127, #111114)"
            spin={!paused && current?.id === selected?.id ? 24 : 0}
            hint="Drag · ← → · click selected disc to play"
            ariaLabel={popup ? 'Now playing record carousel' : 'Your library record carousel'}
        />
        {!popup && <div className="disc-selection">
            <div><span className="eyebrow">ON THE TURNTABLE</span><strong>{selected.title}</strong><span>{selected.artist}</span></div>
            <button className="button primary" onClick={() => onPlay(selected.id)}><Icon name="play"/>Play selected track</button>
        </div>}
    </div>;
});
function Player({model, actions}: {model: Model; actions: Actions}) {
    const seekable = model.current?.source !== 'radio' && Number.isFinite(model.duration) && model.duration > 0;
    const [scrub, setScrub] = React.useState<number | null>(null);
    React.useEffect(() => setScrub(null), [model.current?.id]);
    const percent = scrub ?? (seekable ? model.position / model.duration * 100 : 0);
    const transport = (name: string, label: string, action: () => void, active?: boolean) =>
        <button className="icon-button" aria-label={label} aria-pressed={active} disabled={!model.current} onClick={action}><Icon name={name}/></button>;
    return <>
        <Discs tracks={model.queue} current={model.current} paused={model.paused} popup onPlay={actions.playQueue}/>
        <div className="popup-playback">
            <div className="popup-track-heading"><div><h2>{model.current?.title || 'Choose a track'}</h2><p>{model.current?.artist || 'Add music to your library to start listening.'}</p></div>
                {transport('heart', 'Favorite current track', actions.favorite, model.favorite)}</div>
            <div className="popup-progress"><span>{model.current?.source === 'radio' ? 'LIVE' : time(scrub === null ? model.position : scrub / 100 * model.duration)}</span>
                <input type="range" aria-label="Popup seek in track" min="0" max="100" step="0.1" disabled={!seekable} value={percent}
                    style={{backgroundSize: `${percent}% 100%`}}
                    onChange={e => setScrub(Number(e.target.value))}
                    onPointerUp={e => {actions.seek(Number(e.currentTarget.value)); setScrub(null);}}
                    onPointerCancel={() => setScrub(null)}
                    onKeyUp={e => {actions.seek(Number(e.currentTarget.value)); setScrub(null);}}
                    onBlur={e => {if (scrub !== null) actions.seek(Number(e.currentTarget.value)); setScrub(null);}}/>
                <span>{model.current?.source === 'radio' ? '∞' : time(model.duration)}</span></div>
            <div className="popup-transport">
                {transport('shuffle', 'Popup shuffle', actions.shuffle, model.shuffle)}
                {transport('previous', 'Popup previous track', actions.previous)}
                <button className="play-button" aria-label={model.paused ? 'Popup play' : 'Popup pause'} disabled={!model.current} onClick={actions.togglePlay}><Icon name={model.paused ? 'play' : 'pause'}/></button>
                {transport('next', 'Popup next track', actions.next)}
                {transport(model.repeat === 'one' ? 'one' : 'repeat', `Popup repeat ${model.repeat}`, actions.repeat, model.repeat !== 'off')}
            </div>
            <label className="popup-volume"><Icon name={model.volume === 0 ? 'mute' : 'volume'}/><span className="sr-only">Popup volume</span>
                <input type="range" min="0" max="100" value={model.volume} onChange={e => actions.volume(Number(e.target.value))} style={{backgroundSize: `${model.volume}% 100%`}}/>
            </label>
            <p className="popup-status" role="status">{model.status}</p>
        </div>
    </>;
}
export function mountDiscUI(libraryNode: HTMLElement, popupNode: HTMLElement, actions: Actions) {
    const libraryRoot = createRoot(libraryNode), popupRoot = createRoot(popupNode);
    // Stable snapshots keep audio time updates from rebuilding every SVG disc.
    const snapshots = new Map<string, {signature: string; tracks: Track[]}>();
    const stableTracks = (name: string, tracks: Track[]) => {
        const signature = JSON.stringify(tracks.map(({id, title, artist, album, source, duration}) => [id, title, artist, album, source, duration]));
        const previous = snapshots.get(name);
        if (previous?.signature === signature) return previous.tracks;
        const snapshot = tracks.map(track => ({...track}));
        snapshots.set(name, {signature, tracks: snapshot});
        return snapshot;
    };
    return {
        update(model: Model) {
            model = {...model, library: stableTracks('library', model.library), queue: stableTracks('queue', model.queue)};
            libraryRoot.render(model.libraryVisible ? <Discs tracks={model.library} current={model.current} paused={model.paused} onPlay={actions.playLibrary}/> : null);
            popupRoot.render(model.popupOpen ? <Player model={model} actions={actions}/> : null);
        }
    };
}
