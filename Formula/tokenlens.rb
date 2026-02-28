class Tokenlens < Formula
  desc "Check token usage for Cursor and other AI providers"
  homepage "https://github.com/ctzeero/tokenlens"
  url "https://github.com/ctzeero/tokenlens/releases/download/1.0.0-beta/tokenlens"
  sha256 "150e3865529501e19711aa51c75547ec0b697773a3ecc91dbd0ce257971cb1a8"
  version "1.0.0-beta"

  def install
    bin.install "tokenlens" => "tlens"
  end

  test do
    system "#{bin}/tlens", "--help"
  end
end
