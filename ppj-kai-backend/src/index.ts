import { createApp } from './app';
import { startMissedTaskScheduler } from './lib/scheduler';

const port = process.env.PORT || 5001;
createApp().listen(port, () => {
  console.log(`Server is running on port ${port}`);
  startMissedTaskScheduler();
});
