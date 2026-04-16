-- Enable realtime for team_board_posts so all team members see messages instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_board_posts;
