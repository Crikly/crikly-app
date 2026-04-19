export default function CoachProfileLoading() {
  return (
    <div className="min-h-screen bg-white animate-pulse">
      {/* Nav bar */}
      <div className="h-16 border-b border-gray-100 bg-white px-6 flex items-center justify-between">
        <div className="h-6 w-24 bg-gray-200 rounded" />
        <div className="h-8 w-28 bg-gray-200 rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb — desktop only */}
        <div className="hidden lg:flex gap-2 mb-6">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-4 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-4 w-4 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>

        {/* Hero gallery */}
        <div className="mb-8 grid gap-2 overflow-hidden rounded-2xl
          [grid-template-columns:1fr] [grid-template-rows:260px] h-[260px]
          md:[grid-template-columns:1fr_1fr] md:[grid-template-rows:240px_140px] md:h-auto
          lg:[grid-template-columns:2fr_1fr_1fr] lg:[grid-template-rows:220px_220px] lg:h-[440px]">
          <div className="bg-gray-200 md:[grid-column:1/-1] lg:[grid-column:auto] lg:row-span-2 rounded-lg" />
          <div className="hidden md:block bg-gray-200 rounded-lg" />
          <div className="hidden md:block bg-gray-200 rounded-lg" />
          <div className="hidden lg:block bg-gray-200 rounded-lg" />
          <div className="hidden lg:block bg-gray-200 rounded-lg" />
        </div>

        {/* Trust row */}
        <div className="flex gap-6 mb-8 pb-8 border-b border-gray-100">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-5 w-5 bg-gray-200 rounded-full" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-12 items-start">
          {/* Main content sections */}
          <div className="space-y-10">
            {/* About */}
            <div>
              <div className="h-6 w-20 bg-gray-200 rounded mb-4" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-5/6 bg-gray-200 rounded" />
                <div className="h-4 w-4/6 bg-gray-200 rounded" />
              </div>
            </div>

            {/* Sports */}
            <div>
              <div className="h-6 w-28 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-20 bg-gray-100 rounded-xl" />
                ))}
              </div>
            </div>

            {/* Qualifications */}
            <div>
              <div className="h-6 w-36 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded-xl" />
                ))}
              </div>
            </div>

            {/* Availability */}
            <div>
              <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
              <div className="grid grid-cols-7 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map(i => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg" />
                ))}
              </div>
            </div>
          </div>

          {/* Aside booking card — desktop */}
          <div className="hidden lg:block sticky top-24">
            <div className="border border-gray-200 rounded-2xl p-6 space-y-4">
              <div className="h-8 w-32 bg-gray-200 rounded" />
              <div className="h-4 w-48 bg-gray-200 rounded" />
              <div className="h-12 w-full bg-gray-200 rounded-xl" />
              <div className="h-4 w-40 bg-gray-200 rounded mx-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="h-6 w-24 bg-gray-200 rounded" />
        <div className="h-11 w-36 bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}
