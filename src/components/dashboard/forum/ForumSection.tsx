import { useState } from "react";
import ForumCategoryList from "./ForumCategoryList";
import ForumTopicList from "./ForumTopicList";
import ForumTopicView from "./ForumTopicView";

export type ForumView = 
  | { type: "categories" }
  | { type: "topics"; categoryId: string; categoryName: string }
  | { type: "topic"; topicId: string; topicTitle: string; categoryId: string; categoryName: string };

const ForumSection = () => {
  const [view, setView] = useState<ForumView>({ type: "categories" });

  return (
    <div className="space-y-4">
      {view.type === "categories" && (
        <ForumCategoryList
          onSelectCategory={(id, name) =>
            setView({ type: "topics", categoryId: id, categoryName: name })
          }
        />
      )}
      {view.type === "topics" && (
        <ForumTopicList
          categoryId={view.categoryId}
          categoryName={view.categoryName}
          onBack={() => setView({ type: "categories" })}
          onSelectTopic={(id, title) =>
            setView({
              type: "topic",
              topicId: id,
              topicTitle: title,
              categoryId: view.categoryId,
              categoryName: view.categoryName,
            })
          }
        />
      )}
      {view.type === "topic" && (
        <ForumTopicView
          topicId={view.topicId}
          topicTitle={view.topicTitle}
          onBack={() =>
            setView({
              type: "topics",
              categoryId: view.categoryId,
              categoryName: view.categoryName,
            })
          }
        />
      )}
    </div>
  );
};

export default ForumSection;
