import { usePageMeta } from "@/contexts/PageMetaContext";
import PageContent from "@/components/layout/PageContent";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchMemberCourses } from "@/services/members.service";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";

const MembersCourses = () => {
  const navigate = useNavigate();

  usePageMeta([{ label: "Membros" }, { label: "Meus Cursos" }], "Meus Cursos");

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["member-courses"],
    queryFn: fetchMemberCourses,
  });

  if (isLoading) return <LoadingState />;

  return (
    <PageContent>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Área de membros</h2>
            <p className="text-sm text-muted-foreground">Acesse seus cursos e continue aprendendo</p>
          </div>
        </div>
        {courses.length === 0 ? (
          <EmptyState title="Nenhum curso encontrado" description="Você ainda não tem acesso a nenhum curso." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((course) => {
              const progress = course.totalLessons > 0 ? Math.round((course.completedLessons / course.totalLessons) * 100) : 0;
              return (
                <Card key={course.id} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group" onClick={() => navigate(`/members/courses/${course.id}`)}>
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    <img src={course.image} alt={course.title} className="object-cover w-full h-full" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                      <span className="text-white text-sm font-medium flex items-center gap-1"><BookOpen className="h-4 w-4" /> Continuar</span>
                    </div>
                  </div>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground text-sm leading-tight">{course.title}</h3>
                      <Badge variant={course.status === "completed" ? "secondary" : "default"} className="shrink-0 text-xs">{course.status === "completed" ? "Concluído" : "Em andamento"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground"><span>{course.completedLessons} de {course.totalLessons} aulas</span><span>{progress}%</span></div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageContent>
  );
};

export default MembersCourses;
