import { isDemo } from "@/lib/demo-utils";
import { demoCourses, demoCourseDetail } from "@/data/customer-stubs";
import type { MemberCourse, CourseDetail, CourseDetailFull } from "@/types/api";

async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || "Request failed");
  }
  return payload?.data as T;
}

// Fetch courses the buyer has access to (via approved orders)
export const fetchMemberCourses = async (): Promise<MemberCourse[]> => {
  if (isDemo()) return demoCourses;
  return await apiFetchJson<MemberCourse[]>("/member/courses");
};

// Fetch course detail with modules, lessons and progress
export const fetchCourseDetail = async (courseId: string): Promise<CourseDetail | null> => {
  if (isDemo()) return demoCourseDetail;
  try {
    return await apiFetchJson<CourseDetail>(`/member/courses/${encodeURIComponent(courseId)}`);
  } catch {
    return null;
  }
};

// Fetch course full detail (with video URLs)
export const fetchCourseFullDetail = async (courseId: string): Promise<CourseDetailFull | null> => {
  if (isDemo()) return demoCourseDetail;
  try {
    return await apiFetchJson<CourseDetailFull>(`/member/courses/${encodeURIComponent(courseId)}/full`);
  } catch {
    return null;
  }
};

// Toggle lesson completion
export const toggleLessonComplete = async (lessonId: string, completed: boolean) => {
  await apiFetchJson<{ ok: true }>("/member/course-progress", {
    method: "POST",
    body: JSON.stringify({ lessonId, completed }),
  });
};
