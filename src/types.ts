export interface Task {
  id: string;
  text: string;
  done: boolean;
  important: boolean;
  urgent: boolean;
}

export interface TaskList {
  id: string;
  name: string;
  tasks: Task[];
}

export interface TimeBlock {
  id: string;
  date: string; // yyyy-mm-dd
  startSlot: number; // index of 30-min slot from START_HOUR
  endSlot: number; // exclusive
  title: string;
  color: string;
}
