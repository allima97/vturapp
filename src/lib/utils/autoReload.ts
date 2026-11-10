type Timer = ReturnType<typeof setTimeout>;

export function createDebouncedReloader(task: () => void | Promise<void>, delayMs = 300) {
  let timer: Timer | null = null;

  function cancel() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      void task();
    }, delayMs);
  }

  return {
    schedule,
    cancel
  };
}
