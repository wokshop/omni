import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True while the system's Reduce Motion is on: motion then jumps straight to its end. */
export function useReduceMotion() {
  const [still, setStill] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setStill);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setStill);
    return () => sub.remove();
  }, []);
  return still;
}
