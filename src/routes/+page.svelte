<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	function openDB() {
		return new Promise<IDBDatabase>((resolve, reject) => {
			const dbName = 'ridingtracker';
			const storeName = 'rides';
			const timerStoreName = 'timer';
			let request = indexedDB.open(dbName, 2);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(storeName)) {
					db.createObjectStore(storeName, { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains(timerStoreName)) {
					db.createObjectStore(timerStoreName, { keyPath: 'key' });
				}
			};

			request.onsuccess = () => {
				const db = request.result;
				if (
					!db.objectStoreNames.contains(storeName) ||
					!db.objectStoreNames.contains(timerStoreName)
				) {
					db.close();
					indexedDB.deleteDatabase(dbName).onsuccess = () => {
						const secondRequest = indexedDB.open(dbName, 2);
						secondRequest.onupgradeneeded = () => {
							const db2 = secondRequest.result;
							db2.createObjectStore(storeName, { keyPath: 'id' });
							db2.createObjectStore(timerStoreName, { keyPath: 'key' });
						};
						secondRequest.onsuccess = () => resolve(secondRequest.result);
						secondRequest.onerror = () => reject(secondRequest.error);
					};
				} else {
					resolve(db);
				}
			};
			request.onerror = () => reject(request.error);
		});
	}

	async function getRides() {
		const db = await openDB();
		return new Promise<{ time: string; date: Date; horse: string; id: number }[]>((resolve) => {
			const tx = db.transaction('rides', 'readonly');
			const store = tx.objectStore('rides');
			const req = store.getAll();
			req.onsuccess = () => {
				const rides = req.result.map((t: any) => ({
					time: t.time,
					date: new Date(t.date),
					horse: t.horse,
					id: t.id
				}));
				resolve(rides);
			};
			req.onerror = () => resolve([]);
		});
	}

	async function setRides(rides: { time: string; date: Date; horse: string; id: number }[]) {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			const tx = db.transaction('rides', 'readwrite');
			const store = tx.objectStore('rides');
			store.clear();
			rides.forEach((t) => {
				store.put({
					id: t.id,
					time: t.time,
					date: t.date instanceof Date ? t.date.toISOString() : t.date,
					horse: t.horse
				});
			});
			tx.oncomplete = () => resolve();
		});
	}

	async function setStartTime(startTime: number) {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			const tx = db.transaction('timer', 'readwrite');
			const store = tx.objectStore('timer');
			store.put({ key: 'startTime', value: startTime });
			tx.oncomplete = () => resolve();
		});
	}

	async function getStartTime(): Promise<number | null> {
		const db = await openDB();
		return new Promise((resolve) => {
			const tx = db.transaction('timer', 'readonly');
			const store = tx.objectStore('timer');
			const req = store.get('startTime');
			req.onsuccess = () => {
				if (req.result) resolve(req.result.value);
				else resolve(null);
			};
			req.onerror = () => resolve(null);
		});
	}

	async function clearStartTime() {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			const tx = db.transaction('timer', 'readwrite');
			const store = tx.objectStore('timer');
			store.delete('startTime');
			tx.oncomplete = () => resolve();
		});
	}

	let timeElapsed = $state('00:00:00');
	let interval: NodeJS.Timeout | undefined;
	let rides = $state<{ time: string; date: Date; horse: string; id: number }[]>([]);
	let selectedHorse = $state('Charmer');
	let rideIdCounter = $state(0);
	let startTime = $state<number | null>(null);
	let isRunning = $state(false);

	function computeTimeElapsed() {
		if (startTime !== null) {
			const now = Date.now();
			const elapsed = now - startTime;
			const totalSeconds = Math.floor(elapsed / 1000);
			const hours = Math.floor(totalSeconds / 3600);
			const minutes = Math.floor((totalSeconds % 3600) / 60);
			const seconds = totalSeconds % 60;
			if (isRunning) {
				const hundredths = Math.floor((elapsed % 1000) / 10)
					.toString()
					.padStart(2, '0');
				timeElapsed = `${hours.toString().padStart(2, '0')}:${minutes
					.toString()
					.padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths}`;
			} else {
				timeElapsed = `${hours.toString().padStart(2, '0')}:${minutes
					.toString()
					.padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
			}
		} else {
			timeElapsed = '00:00:00';
		}
	}

	function startTimer() {
		if (interval) return;
		if (startTime === null) {
			const now = Date.now();
			startTime = now;
			setStartTime(now);
		}
		isRunning = true;
		computeTimeElapsed();
		interval = setInterval(() => {
			computeTimeElapsed();
		}, 10);
	}

	onMount(async () => {
		rides = await getRides();
		if (rides.length > 0) {
			rideIdCounter = Math.max(...rides.map((r) => r.id)) + 1;
		} else {
			rideIdCounter = 0;
		}
		startTime = await getStartTime();
		computeTimeElapsed();
		if (startTime !== null) {
			startTimer();
		}
	});

	$effect(() => {
		setRides(rides);
	});

	function formatDateCustom(date: Date) {
		const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const dayOfWeek = daysOfWeek[date.getDay()];
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const year = String(date.getFullYear()).slice(-2); // 2-digit year
		return `${dayOfWeek}, ${month}/${day}/${year}`;
	}

	function stopTimerSave() {
		if (interval) {
			clearInterval(interval);
			interval = undefined;
		}
		isRunning = false;
		if (startTime !== null) {
			computeTimeElapsed();
			rides = [
				...rides,
				{
					time: timeElapsed.split('.')[0],
					date: new Date(),
					horse: selectedHorse,
					id: rideIdCounter
				}
			];
			rideIdCounter++;
			startTime = null;
			clearStartTime();
			timeElapsed = '00:00:00';
		}
	}

	function deleteRide(id: number) {
		rides = rides.filter((r) => r.id !== id);
		if (rides.length > 0) {
			rideIdCounter = Math.max(...rides.map((r) => r.id)) + 1;
		} else {
			rideIdCounter = 0;
		}
	}
</script>

<h1 class="text-semibold text-center font-mono text-4xl">{timeElapsed}</h1>
<div class="mx-2 my-2 flex w-[calc(100vw-1rem)] flex-row justify-center gap-2">
	<button
		type="button"
		class={`w-1/2 rounded-md p-2 text-xl transition-all duration-100 ease-in-out active:scale-98 active:shadow-sm active:brightness-90
			${selectedHorse === 'Charmer' ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-400'}`}
		onclick={() => (selectedHorse = 'Charmer')}
	>
		Charmer
	</button>
	<button
		type="button"
		class={`w-1/2 rounded-md p-2 text-xl transition-all duration-100 ease-in-out active:scale-98 active:shadow-sm active:brightness-90
			${selectedHorse === 'Miles' ? 'bg-yellow-900 text-white' : 'bg-gray-100 text-gray-400'}`}
		onclick={() => (selectedHorse = 'Miles')}
	>
		Miles
	</button>
</div>
<button
	class="m-2 w-[calc(100vw-1rem)] rounded-md bg-green-500 p-2 text-xl text-white transition-all duration-100 ease-in-out active:scale-98 active:shadow-sm active:brightness-90"
	onclick={startTimer}
>
	Start
</button>

<button
	class="m-2 w-[calc(100vw-1rem)] rounded-md bg-red-500 p-2 text-xl text-white
               transition-all duration-100 ease-in-out
               active:scale-98 active:shadow-sm active:brightness-90"
	onclick={stopTimerSave}
>
	Stop & Save
</button>

<button
	class="m-2 w-[calc(100vw-1rem)] rounded-md bg-yellow-500 p-2 text-xl text-white
               transition-all duration-100 ease-in-out
               active:scale-98 active:shadow-sm active:brightness-90"
	onclick={() => {
		if (interval) {
			clearInterval(interval);
			interval = undefined;
		}
		isRunning = false;
		startTime = null;
		clearStartTime();
		timeElapsed = '00:00:00';
	}}
>
	Reset
</button>
<table
	class="mt-4 w-full border-separate border-spacing-y-2 rounded-lg bg-zinc-50 text-left dark:bg-zinc-900"
>
	<thead>
		<tr>
			<th class="px-2 py-1 text-zinc-900 dark:text-zinc-200">Time</th>
			<th class="px-2 py-1 text-zinc-900 dark:text-zinc-200">Date</th>
			<th class="px-2 py-1 text-zinc-900 dark:text-zinc-200">Horse</th>
			<th class="px-2 py-1"></th>
			<th class="px-2 py-1"></th>
		</tr>
	</thead>
	<tbody>
		{#each rides as ride (ride.id)}
			<tr
				class="bg-zinc-100 dark:bg-zinc-800"
				in:fade={{ duration: 125 }}
				out:fly={{ x: -40, duration: 125 }}
			>
				<td class="px-2 py-1 align-middle text-base text-zinc-900 dark:text-zinc-100"
					>{ride.time}</td
				>
				<td
					class="max-w-[7.5rem] truncate px-2 py-1 align-middle text-base whitespace-nowrap text-zinc-900 sm:max-w-none dark:text-zinc-100"
					>{formatDateCustom(ride.date)}</td
				>
				<td class="px-2 py-1 text-center align-middle text-base">
					<span
						class={`rounded-md px-1 py-1 font-semibold
						${ride.horse === 'Charmer' ? 'bg-orange-400 text-white dark:bg-orange-500 dark:text-zinc-900' : 'bg-yellow-900 text-white dark:bg-yellow-800 dark:text-yellow-200'}`}
						>{ride.horse}</span
					>
				</td>
				<td class="px-2 py-1 text-center align-middle">
					<div class="mx-1 h-6 w-px bg-zinc-500 dark:bg-zinc-400"></div>
				</td>
				<td class="px-2 py-1 text-center align-middle text-base">
					<button
						class="rounded-md bg-red-500 px-1 py-1 text-base text-white transition-all duration-100 ease-in-out hover:bg-red-600 active:scale-98 active:shadow-sm active:brightness-90 dark:bg-red-700 dark:hover:bg-red-800"
						onclick={() => deleteRide(ride.id)}>Delete</button
					>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
