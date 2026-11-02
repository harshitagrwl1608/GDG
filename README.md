# Volu-Mess — Chandu ke Chacha Audio

An intentionally inconvenient volume-control experience for someone who is already listening to a track. The page presents seven bad ideas in sequence: try one, say “oh no,” and move to the next.

## Use it

Open `index.html` in a modern browser and press **Play the track**. The page includes a short original demo loop. Use **Load your own audio** to select a local audio file instead. The track keeps playing as you move between the seven controls.

1. **Tilting soundbar:** drag the bar itself left or right. A little tilt to the right makes the internal volume marker run along the rail and jumps the playback level sharply.
2. **Leaky pump:** hold the button to inflate the sound; it slowly loses air when released.
3. **Pi-powered volume:** choose an input from 1–100, then let a displayed π-heavy equation and a fresh random seed map it to a different output volume from 1–100.
4. **Number maze:** navigate open passages through a maze of shuffled 0–100 values. Each step immediately changes the player's volume.
5. **Gather the sound dots:** drag dots into or out of the speaker shape; each dot changes volume by two points.
6. **Arrange the volume digits:** place dots into seven-segment slots to assemble a valid three-digit number from 000–100; valid numbers set the player's volume.
7. **Tilt and launch:** drag the speaker icon upward or downward to aim, then release it. The pointer follows a ballistic arc and its landing position sets the volume.

Each control changes the audio gain for playback inside this page. The player includes a live dBFS meter for the page's signal before the operating-system mixer. A normal static webpage cannot read or set the computer's operating-system master volume, so the device's system volume remains controlled by the user.

No package install or build step is required.
