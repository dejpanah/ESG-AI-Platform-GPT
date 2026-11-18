import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Chat, type ChatHandle } from "@/components/Chat";
import { SearchHistoryPanel } from "@/components/SearchHistoryPanel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useSearchHistory,
  type SearchHistoryItem,
} from "@/hooks/use-search-history";
import { useMediaQuery } from "@/hooks/use-media-query";
import { History, PanelRightClose, PanelRightOpen } from "lucide-react";

function KnowledgeWorkspace() {
  const chatRef = useRef<ChatHandle>(null);
  const { items, recordQuery, removeItem, clearHistory } = useSearchHistory();
  const [pending, setPending] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const handleRun = (item: SearchHistoryItem) => {
    setMobileOpen(false);
    chatRef.current?.ask(item.question, item.requireCitations);
  };

  const handlePrefill = (item: SearchHistoryItem) => {
    setMobileOpen(false);
    chatRef.current?.prefill(item.question, item.requireCitations);
  };

  const toggleHistory = () => {
    if (isDesktop) setDesktopOpen((open) => !open);
    else setMobileOpen((open) => !open);
  };

  return (
    <div className="flex min-w-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">
        <Chat
          ref={chatRef}
          onPendingChange={setPending}
          onQueryComplete={recordQuery}
          headerActions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={toggleHistory}
            >
              {isDesktop ? (
                desktopOpen ? (
                  <PanelRightClose className="size-3.5" />
                ) : (
                  <PanelRightOpen className="size-3.5" />
                )
              ) : (
                <History className="size-3.5" />
              )}
              <span>History</span>
              {items.length > 0 ? (
                <span className="term-dim tabular-nums">({items.length})</span>
              ) : null}
            </Button>
          }
        />
      </main>

      {desktopOpen ? (
        <SearchHistoryPanel
          items={items}
          pending={pending}
          onRun={handleRun}
          onPrefill={handlePrefill}
          onRemove={removeItem}
          onClear={clearHistory}
          className="hidden w-72 shrink-0 border-l border-border lg:flex xl:w-80"
        />
      ) : null}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-80 border-border p-0">
          <SheetTitle className="sr-only">Search History</SheetTitle>
          <SheetDescription className="sr-only">
            Recent user queries saved in local storage
          </SheetDescription>
          <SearchHistoryPanel
            items={items}
            pending={pending}
            onRun={handleRun}
            onPrefill={handlePrefill}
            onRemove={removeItem}
            onClear={clearHistory}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function KnowledgeOS() {
  return <AppShell>{() => <KnowledgeWorkspace />}</AppShell>;
}
